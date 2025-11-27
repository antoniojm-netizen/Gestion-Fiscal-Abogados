import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Invoice, InvoiceType, SavedEntity, ProfessionalProfile } from '../types';
import { Plus, Trash2, Search, Wand2, AlertTriangle, Filter, Download, FileSpreadsheet, Upload, Save, Bookmark, X, ChevronDown, Edit, RefreshCw, Utensils, Plane, HelpCircle, UserPlus, Check, FileInput, FileText, CheckSquare, Square, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, ExternalLink, Calendar } from 'lucide-react';
import { Button } from './Button';
import { analyzeExpenseDeductibility, auditInvoices, extractInvoiceData } from '../services/geminiService';
import { parseFile } from '../services/importService';
import { generateInvoicePDF } from '../services/pdfGenerator';

interface InvoiceManagerProps {
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
}

const escapeCsv = (str: string | number | undefined | boolean) => {
  if (str === undefined || str === null) return '';
  const stringValue = String(str);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

// Helper to format date to European format DD/MM/YYYY
const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  // Ensure we use the date parts directly to avoid timezone shifts on simple YYYY-MM-DD strings
  if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
  }
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Helper for European Currency Format
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

// Helper for European Number Format (decimals, no symbol) - mainly for CSV/Excel raw data
const formatNumber = (amount: number) => {
  return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface SavedFilter {
  name: string;
  type: 'ALL' | 'INCOME' | 'EXPENSE';
  category: string;
  entity?: string;
  nif?: string;
}

// Spanish Tax Classification Constants
const IRPF_INCOME_TYPES = [
    "Prestación de servicios",
    "Venta de bienes",
    "Subvenciones corrientes",
    "Autoconsumo de bienes/servicios",
    "Otros ingresos"
];

const IRPF_EXPENSE_TYPES = [
    "Consumos de explotación",
    "Sueldos y salarios",
    "Seguridad Social",
    "Otros gastos de personal",
    "Arrendamientos y cánones",
    "Reparaciones y conservación",
    "Servicios de profesionales independientes",
    "Suministros",
    "Otros servicios exteriores",
    "Tributos fiscalmente deducibles",
    "Gastos financieros",
    "Amortizaciones",
    "Otros conceptos"
];

const IVA_EXPENSE_TYPES = [
    "Operaciones Interiores Corrientes",
    "Bienes de Inversión",
    "Importaciones",
    "Adquisiciones Intracomunitarias",
    "Inversión del Sujeto Pasivo"
];

// Validation Helper for Spanish IDs
const validateSpanishID = (value: string): string | null => {
  if (!value) return null;
  const str = value.toUpperCase().trim();
  
  const validChars = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const nifRegex = /^[0-9]{8}[A-Z]$/;
  const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/;
  const cifRegex = /^[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J]$/;

  // DNI (NIF) Validation: 8 digits + Control Letter
  if (nifRegex.test(str)) {
    const number = parseInt(str.substr(0, 8), 10);
    const letter = str.charAt(8);
    const expectedLetter = validChars.charAt(number % 23);
    if (letter !== expectedLetter) return `NIF incorrecto: La letra debería ser ${expectedLetter}`;
    return null;
  }

  // NIE Validation: X/Y/Z + 7 digits + Control Letter
  if (nieRegex.test(str)) {
    let prefix = str.charAt(0);
    let numberStr = str.substr(1, 7);
    if (prefix === 'X') numberStr = '0' + numberStr;
    if (prefix === 'Y') numberStr = '1' + numberStr;
    if (prefix === 'Z') numberStr = '2' + numberStr;
    
    const number = parseInt(numberStr, 10);
    const letter = str.charAt(8);
    const expectedLetter = validChars.charAt(number % 23);
    if (letter !== expectedLetter) return `NIE incorrecto: La letra debería ser ${expectedLetter}`;
    return null;
  }

  // CIF Validation (Basic Structure)
  if (cifRegex.test(str)) {
    return null; 
  }

  return "Formato español inválido. Esperado: DNI, CIF o NIE";
};

export const InvoiceManager: React.FC<InvoiceManagerProps> = ({ invoices, setInvoices }) => {
  const [activeTab, setActiveTab] = useState<'income' | 'expense' | 'list'>('income');
  const [formData, setFormData] = useState<Partial<Invoice>>({
    date: new Date().toISOString().split('T')[0],
    registrationDate: new Date().toISOString().split('T')[0],
    ivaRate: 21,
    irpfRate: 15,
    baseAmount: 0,
    fees: 0,
    taxableExpenses: 0,
    supplies: 0,
    retainer: 0,
    fiscalAddress: '',
    supplierNumber: '',
    irpfIncomeType: 'Prestación de servicios',
    irpfExpenseType: 'Otros servicios exteriores',
    ivaExpenseType: 'Operaciones Interiores Corrientes'
  });
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // File Upload State (AI)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false); // New state for drag visual feedback

  // Bulk Import State (Excel/CSV)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportType, setBulkImportType] = useState<InvoiceType>(InvoiceType.INCOME);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Context Confirmation State
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any>(null);

  // Delete Confirmation State
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);

  // Validation State
  const [nifError, setNifError] = useState<string | null>(null);
  const [nifWarning, setNifWarning] = useState<string | null>(null);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

  // Filter State
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterEntity, setFilterEntity] = useState<string>('');
  const [filterNif, setFilterNif] = useState<string>('');
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear()); // Year Filter

  // Calculate available years
  const availableYears = useMemo(() => {
      const years = new Set(invoices.map(inv => new Date(inv.date).getFullYear()));
      years.add(new Date().getFullYear()); // Ensure current year is always there
      return Array.from(years).sort((a: number, b: number) => b - a);
  }, [invoices]);


  // Helper to calculate next number based on pattern Prefix-YY-Sequence
  const calculateNextNumber = (type: InvoiceType): string => {
    const yearFull = new Date().getFullYear();
    const yearShort = yearFull.toString().slice(-2);
    const prefix = type === InvoiceType.INCOME ? 'A' : 'R';
    
    // Regex to match Format: Prefix-YY-Number (e.g., A-25-1, R-25-10)
    const regex = new RegExp(`^${prefix}-${yearShort}-(\\d+)$`);

    const relevantInvoices = invoices.filter(i => i.type === type && regex.test(i.number));
    
    // Find max sequence number
    const maxSeq = relevantInvoices.reduce((max, inv) => {
        const match = inv.number.match(regex);
        if (match) {
            const num = parseInt(match[1], 10);
            return Math.max(max, num);
        }
        return max;
    }, 0);

    const nextSeq = maxSeq + 1;
    return `${prefix}-${yearShort}-${nextSeq}`;
  };

  // Suggest next invoice number logic
  useEffect(() => {
    if (editingId) return; // Don't overwrite if editing

    if (activeTab === 'income') {
      const nextNum = calculateNextNumber(InvoiceType.INCOME);
      // Only update if field is empty or matches generated pattern (avoids overwriting manual custom input mid-typing)
      if (!formData.number || formData.number.startsWith(`A-`)) {
         setFormData(prev => ({ ...prev, number: nextNum, type: InvoiceType.INCOME }));
      }
    } else if (activeTab === 'expense') {
      const nextNum = calculateNextNumber(InvoiceType.EXPENSE);
      // For expenses, we now default to internal registration number R-YY-Z
      if (!formData.number || formData.number.startsWith(`R-`) || formData.number === '') {
         setFormData(prev => ({ ...prev, number: nextNum, type: InvoiceType.EXPENSE }));
      }
    }
  }, [activeTab, invoices, editingId]);

  // Saved Entities (Address Book)
  const [savedEntities, setSavedEntities] = useState<SavedEntity[]>(() => {
    try {
        return JSON.parse(localStorage.getItem('savedEntities') || '[]');
    } catch {
        return [];
    }
  });

  // Saved Categories (Fiscal Categories)
  const [savedCategories, setSavedCategories] = useState<string[]>(() => {
    try {
        return JSON.parse(localStorage.getItem('savedCategories') || '[]');
    } catch {
        return [];
    }
  });

  useEffect(() => {
      localStorage.setItem('savedEntities', JSON.stringify(savedEntities));
  }, [savedEntities]);

  useEffect(() => {
      localStorage.setItem('savedCategories', JSON.stringify(savedCategories));
  }, [savedCategories]);

  // Handle Tab switching manually to ensure form reset only happens when explicitly requested
  const handleTabSwitch = (tab: 'income' | 'expense' | 'list') => {
      setActiveTab(tab);
      if (tab === 'list') {
          // Just switch view, keep selection
      } else {
          // Reset for New Invoice
          setEditingId(null);
          setNifError(null);
          setNifWarning(null);
          setSelectedIds(new Set());
          
          const nextNum = tab === 'income' 
            ? calculateNextNumber(InvoiceType.INCOME) 
            : calculateNextNumber(InvoiceType.EXPENSE);

          setFormData({
            date: new Date().toISOString().split('T')[0],
            registrationDate: new Date().toISOString().split('T')[0],
            ivaRate: 21,
            irpfRate: 15,
            baseAmount: 0,
            fees: 0,
            taxableExpenses: 0,
            supplies: 0,
            retainer: 0,
            number: nextNum,
            concept: '',
            entityName: '',
            nif: '',
            fiscalAddress: '',
            supplierNumber: '',
            irpfIncomeType: 'Prestación de servicios',
            irpfExpenseType: 'Otros servicios exteriores',
            ivaExpenseType: 'Operaciones Interiores Corrientes'
          });
      }
  };

  const handleSaveEntity = () => {
      if (!formData.entityName || !formData.nif) {
          alert("Debe introducir al menos el Nombre y el NIF para guardar.");
          return;
      }
      if (nifError) {
          alert("Corrija el NIF antes de guardar.");
          return;
      }

      // 1. Check for duplicates
      const existing = savedEntities.find(e => e.nif === formData.nif);
      if (existing) {
          alert(`AVISO: Ya existe un contacto con el NIF ${formData.nif} registrado como "${existing.name}". No se ha guardado para evitar duplicados.`);
          return;
      }

      const type = activeTab === 'income' ? 'CLIENT' : 'PROVIDER';
      
      // 2. Generate Internal ID (C-X or P-X)
      const prefix = type === 'CLIENT' ? 'C' : 'P';
      const relevantEntities = savedEntities.filter(e => e.type === type && e.internalId?.startsWith(prefix));
      
      const maxId = relevantEntities.reduce((max, e) => {
          if (!e.internalId) return max;
          const numPart = parseInt(e.internalId.split('-')[1]);
          return isNaN(numPart) ? max : Math.max(max, numPart);
      }, 0);
      
      const nextInternalId = `${prefix}-${maxId + 1}`;

      const newEntity: SavedEntity = {
          internalId: nextInternalId,
          name: formData.entityName,
          nif: formData.nif,
          fiscalAddress: formData.fiscalAddress || '',
          type
      };

      setSavedEntities(prev => {
          return [...prev, newEntity].sort((a, b) => a.name.localeCompare(b.name));
      });

      alert(`✅ ${type === 'CLIENT' ? 'Cliente' : 'Proveedor'} guardado correctamente.\n\nFicha creada: ${newEntity.name}\nNº Registro Interno: ${nextInternalId}`);
  };

  // Calculate Known Entities for Dropdown/Auto-fill (Merge History + Saved)
  const knownEntities = useMemo(() => {
    const targetType = activeTab === 'income' ? InvoiceType.INCOME : InvoiceType.EXPENSE;
    const entityTypeLabel = activeTab === 'income' ? 'CLIENT' : 'PROVIDER';
    
    const entities = new Map<string, { nif: string, fiscalAddress: string }>();
    
    // 1. Add from Saved Entities (Priority or Base)
    savedEntities.forEach(e => {
        if (e.type === entityTypeLabel) {
            entities.set(e.name.toLowerCase(), { nif: e.nif, fiscalAddress: e.fiscalAddress });
        }
    });

    // 2. Add from Invoice History (if not exists, or to enrich)
    invoices.forEach(inv => {
      if (inv.type === targetType && inv.entityName) {
        if (!entities.has(inv.entityName.toLowerCase())) {
             entities.set(inv.entityName.toLowerCase(), { 
                nif: inv.nif, 
                fiscalAddress: inv.fiscalAddress || '' 
            });
        }
      }
    });

    const refinedMap = new Map<string, { displayName: string, nif: string, fiscalAddress: string }>();
    
    savedEntities.forEach(e => {
        if (e.type === entityTypeLabel) {
            refinedMap.set(e.name.toLowerCase(), { displayName: e.name, nif: e.nif, fiscalAddress: e.fiscalAddress });
        }
    });

    invoices.forEach(inv => {
        if (inv.type === targetType && inv.entityName) {
            if (!refinedMap.has(inv.entityName.toLowerCase())) {
                refinedMap.set(inv.entityName.toLowerCase(), { 
                    displayName: inv.entityName, 
                    nif: inv.nif, 
                    fiscalAddress: inv.fiscalAddress || '' 
                });
            }
        }
    });

    return Array.from(refinedMap.values())
      .map((data) => ({ name: data.displayName, nif: data.nif, fiscalAddress: data.fiscalAddress }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices, activeTab, savedEntities]);

  // Available Invoice Numbers for current tab (for loading/editing)
  const existingNumbers = useMemo(() => {
      const targetType = activeTab === 'income' ? InvoiceType.INCOME : InvoiceType.EXPENSE;
      return invoices
        .filter(inv => inv.type === targetType)
        .map(inv => inv.number);
  }, [invoices, activeTab]);

  // Saved Filters State
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
      try {
          return JSON.parse(localStorage.getItem('savedFilters') || '[]');
      } catch {
          return [];
      }
  });
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');

  useEffect(() => {
      localStorage.setItem('savedFilters', JSON.stringify(savedFilters));
  }, [savedFilters]);

  const handleSaveFilter = () => {
      if (!newFilterName.trim()) return;
      setSavedFilters(prev => [...prev, { 
          name: newFilterName, 
          type: filterType, 
          category: filterCategory,
          entity: filterEntity,
          nif: filterNif
      }]);
      setNewFilterName('');
      setShowSaveFilter(false);
  };

  const applySavedFilter = (filter: SavedFilter) => {
      setFilterType(filter.type);
      setFilterCategory(filter.category);
      setFilterEntity(filter.entity || '');
      setFilterNif(filter.nif || '');
  };
  
  const deleteSavedFilter = (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setSavedFilters(prev => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const baseAmount = formData.baseAmount || 0;
  const ivaAmount = baseAmount * ((formData.ivaRate || 0) / 100);
  const irpfAmount = baseAmount * ((formData.irpfRate || 0) / 100);
  const suppliesAmount = formData.supplies || 0; // Suplidos

  const totalAmount = activeTab === 'income' 
    ? baseAmount + ivaAmount - irpfAmount + suppliesAmount
    : baseAmount + ivaAmount - irpfAmount;
  
  const amountToPay = totalAmount - (formData.retainer || 0);

  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{deductible: boolean, reason: string} | null>(null);
  
  // Audit State
  const [auditResults, setAuditResults] = useState<any[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);

  // Filter Logic
  const uniqueCategories = useMemo(() => {
    const invoiceCategories = invoices.map(i => i.category).filter(Boolean) as string[];
    const combined = new Set([...savedCategories, ...invoiceCategories]);
    return Array.from(combined).sort();
  }, [invoices, savedCategories]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredInvoices = useMemo(() => {
      // 1. Filter
      let result = invoices.filter(inv => {
        if (filterType === 'INCOME' && inv.type !== InvoiceType.INCOME) return false;
        if (filterType === 'EXPENSE' && inv.type !== InvoiceType.EXPENSE) return false;
        if (filterCategory && inv.category !== filterCategory) return false;
        if (filterEntity && !inv.entityName.toLowerCase().includes(filterEntity.toLowerCase())) return false;
        if (filterNif && !inv.nif.toLowerCase().includes(filterNif.toLowerCase())) return false;
        // Year Filter
        const invYear = new Date(inv.date).getFullYear();
        if (filterYear && invYear !== filterYear) return false;
        
        return true;
      });

      // 2. Sort
      result.sort((a: any, b: any) => {
          let aValue = a[sortConfig.key];
          let bValue = b[sortConfig.key];

          // Handle special cases
          if (sortConfig.key === 'entityName') {
              aValue = (aValue || '').toLowerCase();
              bValue = (bValue || '').toLowerCase();
          }
          if (sortConfig.key === 'category') {
              aValue = (aValue || '').toLowerCase();
              bValue = (bValue || '').toLowerCase();
          }
          if (sortConfig.key === 'number') {
              aValue = (aValue || '').toLowerCase();
              bValue = (bValue || '').toLowerCase();
          }

          if (aValue < bValue) {
              return sortConfig.direction === 'asc' ? -1 : 1;
          }
          if (aValue > bValue) {
              return sortConfig.direction === 'asc' ? 1 : -1;
          }
          return 0;
      });

      return result;
  }, [invoices, filterType, filterCategory, filterEntity, filterNif, filterYear, sortConfig]);

  // Selection Logic
  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === filteredInvoices.length && filteredInvoices.length > 0) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(filteredInvoices.map(i => i.id)));
      }
  };

  const handleBulkDelete = () => {
      setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
      setInvoices(prev => prev.filter(inv => !selectedIds.has(inv.id)));
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
  };

  // Handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    let newFormData: any = { ...formData, [name]: value };

    // Clear NIF error/warning when typing
    if (name === 'nif') {
        setNifError(null);
        setNifWarning(null);
    }

    // Number Logic: Check if we need to load an existing invoice
    if (name === 'number') {
        const targetType = activeTab === 'income' ? InvoiceType.INCOME : InvoiceType.EXPENSE;
        
        // If we are not currently editing an ID, try to find and load an invoice with this number
        if (!editingId) {
            const existingInvoice = invoices.find(inv => inv.number === value && inv.type === targetType);
            
            if (existingInvoice) {
                // Load existing invoice data into form
                newFormData = { ...existingInvoice };
                setEditingId(existingInvoice.id);
                
                // Re-validate NIF with relaxed rules for Expenses
                const error = validateSpanishID(existingInvoice.nif);
                if (error) {
                    if (targetType === InvoiceType.EXPENSE) {
                        setNifError(null);
                        setNifWarning("Aviso: Formato no estándar (Guardado previamente)");
                    } else {
                        setNifError(error);
                        setNifWarning(null);
                    }
                } else {
                    setNifError(null);
                    setNifWarning(null);
                }
            }
        }
    }

    // Auto-fill logic when Entity Name changes
    if (name === 'entityName') {
      const match = knownEntities.find(e => e.name.toLowerCase() === value.toLowerCase());
      if (match) {
        newFormData.nif = match.nif;
        newFormData.fiscalAddress = match.fiscalAddress;
        
        const error = validateSpanishID(match.nif);
        if (error) {
             const targetType = activeTab === 'income' ? InvoiceType.INCOME : InvoiceType.EXPENSE;
             if (targetType === InvoiceType.EXPENSE) {
                setNifError(null);
                setNifWarning("Aviso: Formato no estándar detectado");
             } else {
                setNifError(error);
             }
        }
      }
    }

    // Number conversion for specific fields
    if (['baseAmount', 'ivaRate', 'irpfRate', 'fees', 'taxableExpenses', 'retainer', 'supplies'].includes(name)) {
      newFormData[name] = parseFloat(value) || 0;
    }
    
    // Auto-calculate Base Amount if Fees or TaxableExpenses change (for Income)
    if (activeTab === 'income' && (name === 'fees' || name === 'taxableExpenses')) {
        const fees = name === 'fees' ? (parseFloat(value) || 0) : (newFormData.fees || 0);
        const expenses = name === 'taxableExpenses' ? (parseFloat(value) || 0) : (newFormData.taxableExpenses || 0);
        newFormData.baseAmount = fees + expenses;
    }

    // If changing baseAmount manually in expense, update it directly
    if (activeTab === 'expense' && name === 'baseAmount') {
        newFormData.baseAmount = parseFloat(value) || 0;
    }

    setFormData(newFormData);
  };

  const handleNifBlur = () => {
    if (formData.nif) {
        // Normalize to uppercase on blur for cleaner data
        const upperNif = formData.nif.toUpperCase();
        setFormData(prev => ({ ...prev, nif: upperNif }));
        
        const error = validateSpanishID(upperNif);
        
        if (error) {
            if (activeTab === 'expense') {
                // For Expenses, treat invalid Spanish format as a warning (allow EU/Foreign)
                setNifError(null);
                setNifWarning("Aviso: NIF no normativo español. Se aceptará como Intracomunitario/Extranjero.");
            } else {
                // For Income, stick to strict Spanish rules (assumed default)
                setNifError(error);
                setNifWarning(null);
            }
        } else {
            // Valid Spanish ID
            setNifError(null);
            setNifWarning(null);
        }
    }
  };

  const applyExtractedData = (extractedData: any) => {
      setFormData(prev => ({
        ...prev,
        ...extractedData,
        // Override for expenses: extracted 'number' is usually the supplier's number
        supplierNumber: activeTab === 'expense' && extractedData.number ? extractedData.number : prev.supplierNumber,
        // Keep internal number if expense
        number: activeTab === 'expense' ? prev.number : (extractedData.number || prev.number),
        
        baseAmount: typeof extractedData.baseAmount === 'number' ? extractedData.baseAmount : parseFloat(extractedData.baseAmount || '0'),
        fees: activeTab === 'income' ? extractedData.baseAmount : 0, // Assume total base is fees for import
        taxableExpenses: 0,
        supplies: 0,
        
        ivaRate: typeof extractedData.ivaRate === 'number' ? extractedData.ivaRate : 21,
        irpfRate: typeof extractedData.irpfRate === 'number' ? extractedData.irpfRate : 0,
        type: activeTab === 'expense' ? InvoiceType.EXPENSE : InvoiceType.INCOME,
        deductible: activeTab === 'expense' 
            ? (typeof extractedData.deductible === 'boolean' ? extractedData.deductible : true) 
            : undefined,
        irpfExpenseType: extractedData.irpfExpenseType || extractedData.inferredIrpfExpenseType || 'Otros servicios exteriores',
        ivaExpenseType: extractedData.ivaExpenseType || extractedData.inferredIvaExpenseType || 'Operaciones Interiores Corrientes',
        category: extractedData.category || prev.category
      }));

      if (extractedData.nif) {
          const error = validateSpanishID(extractedData.nif);
          if (error) {
              // Same logic for imported data
              if (activeTab === 'expense') {
                  setNifError(null);
                  setNifWarning("NIF Importado no estándar (Comunitario/Extranjero)");
              } else {
                  setNifError(error);
              }
          }
      }
  };

  // Reusable file processing logic for both click and drop events
  const processUploadedFile = async (file: File) => {
    setIsImporting(true);
    setNifError(null);
    setNifWarning(null);
    setEditingId(null); // Reset edit mode on new upload

    try {
      const extractedData = await extractInvoiceData(file);
      
      // Check for context ambiguity in expenses
      if (activeTab === 'expense' && (extractedData.suggestedContext === 'MEAL' || extractedData.suggestedContext === 'TRAVEL')) {
          setPendingImportData(extractedData);
          setContextModalOpen(true);
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
      }

      applyExtractedData(extractedData);
      alert("Datos extraídos correctamente. Por favor, revisa los campos fiscales y la deducibilidad.");
      
    } catch (err) {
      console.error(err);
      alert("Error al procesar el documento. Inténtalo de nuevo.");
    } finally {
      setIsImporting(false);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle standard file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      processUploadedFile(file);
    } else {
        if(file) alert("Formato no soportado. Por favor sube una imagen o un PDF.");
    }
  };

  const handleContextDecision = (isBusiness: boolean, category?: string) => {
      if (!pendingImportData) return;

      const finalData = { ...pendingImportData };
      
      if (isBusiness) {
          finalData.deductible = true;
          if (category) {
              finalData.category = category;
              // Adjust fiscal type for travel/diets implies standard services
              if (category === 'Dietas y Estancias' || category === 'Desplazamientos' || category === 'Atenciones a clientes y proveedores') {
                  finalData.irpfExpenseType = 'Otros servicios exteriores'; 
              }
          }
      } else {
          finalData.deductible = false;
          finalData.category = 'Personal / No Deducible';
      }

      applyExtractedData(finalData);
      setContextModalOpen(false);
      setPendingImportData(null);
  };

  const analyzeExpense = async () => {
    if (!formData.concept || !formData.baseAmount) return;
    setIsAnalyzing(true);
    const result = await analyzeExpenseDeductibility(formData.concept, formData.baseAmount);
    setAiAnalysis(result);
    setFormData(prev => ({
      ...prev,
      deductible: result.deductible,
      category: result.suggestedIrpfExpenseType || 'Otros servicios exteriores',
      ivaRate: result.suggestedIvaRate,
      irpfRate: result.suggestedIrpfRate,
      irpfExpenseType: result.suggestedIrpfExpenseType || prev.irpfExpenseType,
      ivaExpenseType: result.suggestedIvaExpenseType || prev.ivaExpenseType
    }));
    setIsAnalyzing(false);
  };

  const cancelEdit = () => {
      setEditingId(null);
      // Recalculate next number for current tab
      const nextNum = activeTab === 'income' 
        ? calculateNextNumber(InvoiceType.INCOME) 
        : calculateNextNumber(InvoiceType.EXPENSE);

      setFormData({
        date: new Date().toISOString().split('T')[0],
        registrationDate: new Date().toISOString().split('T')[0],
        ivaRate: 21,
        irpfRate: 15,
        baseAmount: 0,
        fees: 0,
        taxableExpenses: 0,
        supplies: 0,
        retainer: 0,
        number: nextNum,
        concept: '',
        entityName: '',
        nif: '',
        fiscalAddress: '',
        supplierNumber: '',
        irpfIncomeType: 'Prestación de servicios',
        irpfExpenseType: 'Otros servicios exteriores',
        ivaExpenseType: 'Operaciones Interiores Corrientes'
      });
      setNifError(null);
      setNifWarning(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (nifError) {
        alert("Por favor, corrige los errores en el NIF antes de guardar.");
        return;
    }

    const invoiceData: Invoice = {
      id: editingId || crypto.randomUUID(),
      type: activeTab === 'income' ? InvoiceType.INCOME : InvoiceType.EXPENSE,
      number: formData.number!,
      date: formData.date!,
      registrationDate: activeTab === 'expense' ? formData.registrationDate : undefined,
      nif: formData.nif!,
      entityName: formData.entityName!,
      fiscalAddress: formData.fiscalAddress,
      supplierNumber: activeTab === 'expense' ? formData.supplierNumber : undefined,
      concept: formData.concept!,
      baseAmount: baseAmount,
      fees: activeTab === 'income' ? (formData.fees || 0) : undefined,
      taxableExpenses: activeTab === 'income' ? (formData.taxableExpenses || 0) : undefined,
      supplies: activeTab === 'income' ? (formData.supplies || 0) : undefined,
      retainer: activeTab === 'income' ? (formData.retainer || 0) : undefined,
      ivaRate: formData.ivaRate!,
      ivaAmount: ivaAmount,
      irpfRate: formData.irpfRate!,
      irpfAmount: irpfAmount,
      totalAmount: totalAmount,
      deductible: activeTab === 'expense' ? formData.deductible : undefined,
      category: formData.category,
      irpfIncomeType: activeTab === 'income' ? formData.irpfIncomeType : undefined,
      irpfExpenseType: activeTab === 'expense' ? formData.irpfExpenseType : undefined,
      ivaExpenseType: activeTab === 'expense' ? formData.ivaExpenseType : undefined,
    };

    // Check for duplicates globally (for current type)
    // Exclude the current invoice if we are in edit mode
    const duplicate = invoices.find(i => 
        i.number === invoiceData.number && 
        i.type === invoiceData.type && 
        i.id !== invoiceData.id
    );

    if (duplicate) {
        alert(`Ya existe una factura de tipo ${invoiceData.type === InvoiceType.INCOME ? 'Ingreso' : 'Gasto'} con el número ${invoiceData.number}. Por favor, usa un número único.`);
        return;
    }

    // Auto-save new category if it exists and isn't already saved
    if (formData.category && !savedCategories.includes(formData.category)) {
        setSavedCategories(prev => [...prev, formData.category!].sort());
    }

    if (editingId) {
        // Update existing invoice
        try {
            if (window.confirm("¿Estás seguro de que deseas guardar la edición de esta factura?")) {
                setInvoices(prev => prev.map(inv => inv.id === editingId ? invoiceData : inv));
                alert("Edición guardada correctamente.");
                cancelEdit(); // Exit edit mode
            }
        } catch (e) {
            console.error("Error al guardar edición:", e);
        }
    } else {
        // Create new invoice
        setInvoices(prev => [...prev, invoiceData]);
        alert("Factura guardada correctamente.");
        cancelEdit(); // Reset form
    }
  };

  const handleGeneratePDF = () => {
    if (!formData.entityName || !formData.nif) {
        alert("Rellena los datos básicos (Cliente, NIF) antes de generar el PDF.");
        return;
    }
    
    // Ensure calculation logic is consistent with PDF expectation
    const currentTotal = activeTab === 'income' 
        ? (formData.baseAmount || 0) + ((formData.baseAmount || 0) * ((formData.ivaRate || 0)/100)) - ((formData.baseAmount || 0) * ((formData.irpfRate || 0)/100)) + (formData.supplies || 0)
        : 0;

    const previewInvoice: Partial<Invoice> = {
        ...formData,
        ivaAmount: (formData.baseAmount || 0) * ((formData.ivaRate || 0)/100),
        irpfAmount: (formData.baseAmount || 0) * ((formData.irpfRate || 0)/100),
        totalAmount: currentTotal
    };

    // Get Professional Profile from localStorage
    const savedProfile = localStorage.getItem('professionalProfile');
    const profile: ProfessionalProfile = savedProfile ? JSON.parse(savedProfile) : { name: '' } as any;

    if (!profile.name) {
        if(!window.confirm("No has configurado tus 'Datos del Profesional'. El PDF saldrá incompleto. ¿Deseas continuar?")) {
            return;
        }
    }

    try {
        generateInvoicePDF(previewInvoice, profile);
    } catch (e) {
        console.error("PDF Error:", e);
        alert("Ocurrió un error al generar el PDF. Verifica los datos introducidos.");
    }
  };

  const handleLinkToAEAT = () => {
      // 1. Copy data to clipboard for easy pasting
      const summary = `
DATOS FACTURA (VERIFACTU):
--------------------------
Nº Factura: ${formData.number}
Fecha Expedición: ${formatDate(formData.date)}
NIF Cliente: ${formData.nif}
Nombre Cliente: ${formData.entityName}
Descripción: ${formData.concept}
Base Imponible: ${formatNumber(baseAmount)}
Cuota IVA (${formData.ivaRate}%): ${formatNumber(ivaAmount)}
Cuota IRPF (${formData.irpfRate}%): ${formatNumber(irpfAmount)}
Total Factura: ${formatNumber(totalAmount)}
--------------------------
      `.trim();

      navigator.clipboard.writeText(summary).then(() => {
          alert("📋 Datos copiados al portapapeles.\n\nSe abrirá la web de la AEAT en una nueva pestaña. Puedes pegar estos datos (Ctrl+V) en un bloc de notas o usarlos de referencia para rellenar el formulario.");
          // 2. Open AEAT Invoice App in new tab
          window.open("https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/MenuAplicacionFacturacion", "_blank");
      }).catch(err => {
          console.error("Error al copiar: ", err);
          window.open("https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/MenuAplicacionFacturacion", "_blank");
      });
  };

  const confirmDelete = () => {
    if (invoiceToDelete) {
      setInvoices(prev => prev.filter(i => i.id !== invoiceToDelete));
      setInvoiceToDelete(null);
    }
  };

  const runAudit = async () => {
    setIsAuditing(true);
    const results = await auditInvoices(invoices);
    setAuditResults(results.alerts || []);
    setIsAuditing(false);
  };

  const renderSortIcon = (columnKey: string) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="h-3 w-3 text-slate-300 ml-1 inline" />;
    return sortConfig.direction === 'asc' 
        ? <ArrowUp className="h-3 w-3 text-indigo-600 ml-1 inline" />
        : <ArrowDown className="h-3 w-3 text-indigo-600 ml-1 inline" />;
  };

  // Export Functions
  const exportToCSV = () => {
    const headers = [
        "ID", "Fecha Factura", "Fecha Registro", "Tipo", "Número Interno", "Nº Factura Proveedor", "NIF", "Nombre", "Domicilio Fiscal", 
        "Concepto", "Categoría", "Tipo Ingreso IRPF", "Tipo Gasto IRPF", "Tipo Gasto IVA",
        "Base Imponible", "IVA %", "Cuota IVA", "IRPF %", "Cuota IRPF", "Total", "Deducible"
    ];
    const csvContent = [
      headers.join(","),
      ...filteredInvoices.map(inv => [
        inv.id,
        formatDate(inv.date),
        formatDate(inv.registrationDate),
        inv.type,
        escapeCsv(inv.number),
        escapeCsv(inv.supplierNumber || ''),
        escapeCsv(inv.nif),
        escapeCsv(inv.entityName),
        escapeCsv(inv.fiscalAddress),
        escapeCsv(inv.concept),
        escapeCsv(inv.category),
        escapeCsv(inv.irpfIncomeType),
        escapeCsv(inv.irpfExpenseType),
        escapeCsv(inv.ivaExpenseType),
        formatNumber(inv.baseAmount),
        inv.ivaRate,
        formatNumber(inv.ivaAmount),
        inv.irpfRate,
        formatNumber(inv.irpfAmount),
        formatNumber(inv.totalAmount),
        inv.deductible ? "SI" : "NO"
      ].join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Libro_Registro_${filterType}_${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToXLS = () => {
    const table = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"></head>
      <body>
      <table border="1">
        <thead>
          <tr>
            <th>Fecha Factura</th><th>Fecha Registro</th><th>Tipo</th><th>Número Interno</th><th>Nº Fac. Prov.</th><th>NIF</th><th>Nombre</th><th>Domicilio Fiscal</th>
            <th>Concepto</th><th>Categoría</th>
            <th>Tipo Ingreso IRPF</th><th>Tipo Gasto IRPF</th><th>Tipo Gasto IVA</th>
            <th>Base</th><th>IVA %</th><th>Cuota IVA</th><th>IRPF %</th><th>Cuota IRPF</th><th>Total</th><th>Deducible</th>
          </tr>
        </thead>
        <tbody>
          ${filteredInvoices.map(inv => `
            <tr>
              <td>${formatDate(inv.date)}</td>
              <td>${formatDate(inv.registrationDate)}</td>
              <td>${inv.type}</td>
              <td>${inv.number}</td>
              <td>${inv.supplierNumber || ''}</td>
              <td>${inv.nif}</td>
              <td>${inv.entityName}</td>
              <td>${inv.fiscalAddress || ''}</td>
              <td>${inv.concept}</td>
              <td>${inv.category || ''}</td>
              <td>${inv.irpfIncomeType || '-'}</td>
              <td>${inv.irpfExpenseType || '-'}</td>
              <td>${inv.ivaExpenseType || '-'}</td>
              <td>${formatNumber(inv.baseAmount)}</td>
              <td>${inv.ivaRate}</td>
              <td>${formatNumber(inv.ivaAmount)}</td>
              <td>${inv.irpfRate}</td>
              <td>${formatNumber(inv.irpfAmount)}</td>
              <td>${formatNumber(inv.totalAmount)}</td>
              <td>${inv.deductible ? 'SI' : 'NO'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </body>
      </html>
    `;
    const blob = new Blob([table], { type: 'application/vnd.vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Libro_Registro_${filterType}_${new Date().toISOString().split('T')[0]}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bulk Import Handlers
  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const newInvoices = await parseFile(file, bulkImportType);
          
          if (newInvoices.length === 0) {
              alert("No se encontraron facturas válidas en el archivo.");
              return;
          }

          if (window.confirm(`Se han encontrado ${newInvoices.length} facturas. ¿Deseas importarlas al sistema?`)) {
              setInvoices(prev => [...prev, ...newInvoices]);
              alert("Importación completada con éxito.");
              setIsBulkImportOpen(false);
          }
      } catch (error: any) {
          console.error(error);
          alert(`Error al importar: ${error.message}`);
      } finally {
          if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => handleTabSwitch('income')}
          className={`pb-3 px-4 font-medium text-sm transition-colors ${activeTab === 'income' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Nueva Factura (Ingreso)
        </button>
        <button 
          onClick={() => handleTabSwitch('expense')}
          className={`pb-3 px-4 font-medium text-sm transition-colors ${activeTab === 'expense' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Nuevo Gasto (Factura Recibida)
        </button>
        <button 
          onClick={() => handleTabSwitch('list')}
          className={`pb-3 px-4 font-medium text-sm transition-colors ${activeTab === 'list' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Libros de Registro
        </button>
      </div>

      {(activeTab === 'income' || activeTab === 'expense') && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* File Upload (Drag & Drop) */}
          <div 
            className={`mb-6 p-4 border-2 border-dashed rounded-xl transition-all duration-200 text-center h-32 flex flex-col justify-center items-center ${isDragging ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              id="fileInput"
              ref={fileInputRef}
              className="hidden" 
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileInputChange}
            />
            <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center gap-2 w-full">
              <div className={`p-2 rounded-full transition-colors ${isDragging ? 'bg-indigo-200' : 'bg-indigo-100'}`}>
                {isImporting ? <RefreshCw className="h-5 w-5 text-indigo-600 animate-spin" /> : <Upload className="h-5 w-5 text-indigo-600" />}
              </div>
              <div className="text-sm">
                 <span className="font-semibold text-indigo-600">{isDragging ? '¡Suelta el archivo aquí!' : 'Sube un PDF o Imagen'}</span>
                 <span className="text-slate-500"> {isDragging ? '' : 'o arrastra y suelta aquí'}</span>
              </div>
              <p className="text-[10px] text-slate-400">Detecta impuestos, fechas y NIFs automáticamente con IA</p>
            </label>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {activeTab === 'income' ? 'Número Factura' : 'Nº Registro Interno'}
                </label>
                <div className="relative">
                    <input
                    type="text"
                    name="number"
                    list="invoiceNumbers"
                    value={formData.number || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                    placeholder={activeTab === 'income' ? "A-25-1" : "R-25-1"}
                    autoComplete="off"
                    />
                    <datalist id="invoiceNumbers">
                        {existingNumbers.map(num => <option key={num} value={num} />)}
                    </datalist>
                    {editingId && (
                        <span className="absolute right-2 top-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">EDITANDO</span>
                    )}
                </div>
              </div>

              {activeTab === 'expense' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nº Factura Proveedor</label>
                    <input
                      type="text"
                      name="supplierNumber"
                      value={formData.supplierNumber || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Ref. Factura Original"
                    />
                  </div>
              )}
              
              {activeTab === 'expense' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Registro</label>
                    <input
                      type="date"
                      name="registrationDate"
                      value={formData.registrationDate || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    {activeTab === 'expense' ? 'Fecha Factura' : 'Fecha'}
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    {activeTab === 'income' ? 'NIF Cliente' : 'NIF Proveedor'}
                </label>
                <input
                  type="text"
                  name="nif"
                  value={formData.nif || ''}
                  onChange={handleInputChange}
                  onBlur={handleNifBlur}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${nifError ? 'border-red-500 focus:ring-red-200' : nifWarning ? 'border-yellow-500 focus:ring-yellow-200' : 'border-slate-300 focus:ring-indigo-500'}`}
                  required
                />
                {nifError && <p className="text-xs text-red-600 mt-1">{nifError}</p>}
                {nifWarning && !nifError && <p className="text-xs text-yellow-600 mt-1 font-medium">{nifWarning}</p>}
              </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                    {activeTab === 'income' ? 'Nombre Cliente' : 'Nombre Proveedor'}
                    </label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                name="entityName"
                                list="entitiesList"
                                value={formData.entityName || ''}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
                                required
                                placeholder="Escribe o selecciona..."
                                autoComplete="off"
                            />
                            <ChevronDown className="absolute right-2 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                            <datalist id="entitiesList">
                                {knownEntities.map((e, i) => (
                                    <option key={i} value={e.name}>
                                        {e.nif}{e.fiscalAddress ? ` - ${e.fiscalAddress}` : ''}
                                    </option>
                                ))}
                            </datalist>
                        </div>
                        <button
                            type="button"
                            onClick={handleSaveEntity}
                            className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                            title="Guardar en agenda"
                        >
                            <UserPlus className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Domicilio Fiscal</label>
                    <input
                        type="text"
                        name="fiscalAddress"
                        value={formData.fiscalAddress || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="C/ Ejemplo 1, Madrid"
                    />
                </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Concepto</label>
              <textarea
                name="concept"
                value={formData.concept || ''}
                onChange={handleInputChange}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 whitespace-pre-wrap"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Categoría (Etiqueta)</label>
                    <input
                        type="text"
                        name="category"
                        list="categoryList"
                        value={formData.category || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <datalist id="categoryList">
                        {uniqueCategories.map((c, i) => <option key={i} value={c} />)}
                    </datalist>
                </div>

                {/* Fiscal Dropdowns */}
                {activeTab === 'income' ? (
                     <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo Ingreso (IRPF)</label>
                        <select
                            name="irpfIncomeType"
                            value={formData.irpfIncomeType || ''}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            {IRPF_INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                     </div>
                ) : (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo Gasto (IRPF)</label>
                            <select
                                name="irpfExpenseType"
                                value={formData.irpfExpenseType || ''}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            >
                                {IRPF_EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo Gasto (IVA)</label>
                            <select
                                name="ivaExpenseType"
                                value={formData.ivaExpenseType || ''}
                                onChange={handleInputChange}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            >
                                {IVA_EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-4 bg-slate-50 rounded-lg items-end">
              
              {activeTab === 'income' ? (
                <>
                  <div className="md:col-span-1">
                    <label className="block text-xs text-slate-500 mb-1">Honorarios</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        name="fees"
                        value={formData.fees || 0}
                        onChange={handleInputChange}
                        className="w-full pl-2 pr-6 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="absolute right-2 top-1 text-slate-400">€</span>
                    </div>
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs text-slate-500 mb-1">Gastos (Base)</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        name="taxableExpenses"
                        value={formData.taxableExpenses || 0}
                        onChange={handleInputChange}
                        className="w-full pl-2 pr-6 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="absolute right-2 top-1 text-slate-400">€</span>
                    </div>
                  </div>
                   <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Base Imponible</label>
                    <div className="relative">
                       <div className="w-full pl-2 pr-2 py-1 bg-slate-100 border border-slate-300 rounded text-slate-700 font-mono text-right">
                          {formatCurrency(baseAmount)}
                       </div>
                    </div>
                  </div>
                </>
              ) : (
                  <div className="md:col-span-3">
                    <label className="block text-xs text-slate-500 mb-1">Base Imponible</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        name="baseAmount"
                        value={formData.baseAmount || 0}
                        onChange={handleInputChange}
                        className="w-full pl-2 pr-6 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="absolute right-2 top-1 text-slate-400">€</span>
                    </div>
                  </div>
              )}

              <div>
                <label className="block text-xs text-slate-500 mb-1">IVA %</label>
                <input
                  type="number"
                  name="ivaRate"
                  value={formData.ivaRate || 0}
                  onChange={handleInputChange}
                  className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                 <label className="block text-xs text-slate-500 mb-1">Cuota IVA</label>
                 <div className="py-1 px-2 bg-slate-100 border border-slate-200 rounded text-slate-700 font-mono text-right text-sm">
                   {formatCurrency(ivaAmount)}
                 </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">IRPF %</label>
                <input
                  type="number"
                  name="irpfRate"
                  value={formData.irpfRate || 0}
                  onChange={handleInputChange}
                  className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                 <label className="block text-xs text-slate-500 mb-1">Retención IRPF</label>
                 <div className="py-1 px-2 bg-slate-100 border border-slate-200 rounded text-slate-700 font-mono text-right text-sm">
                   {formatCurrency(irpfAmount)}
                 </div>
              </div>
              
              {activeTab === 'income' && (
                 <div className="md:col-span-1 mt-2 md:mt-0">
                    <label className="block text-xs text-slate-500 mb-1">Suplidos (Exento)</label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.01"
                            name="supplies"
                            value={formData.supplies || 0}
                            onChange={handleInputChange}
                            className="w-full pl-2 pr-6 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="absolute right-2 top-1 text-slate-400">€</span>
                    </div>
                 </div>
              )}

              <div className="md:col-start-5 md:col-span-1 mt-2 md:mt-0">
                <label className="block text-xs text-slate-500 mb-1">Total Factura</label>
                <div className="text-base font-bold text-slate-800 font-mono text-right border-t border-slate-200 pt-1">{formatCurrency(totalAmount)}</div>
              </div>

               {activeTab === 'income' && (
                  <>
                     <div className="md:col-start-4 md:col-span-1 mt-2 md:mt-0">
                        <label className="block text-xs text-slate-500 mb-1">Provisión Fondos (-)</label>
                         <div className="relative">
                            <input
                                type="number"
                                step="0.01"
                                name="retainer"
                                value={formData.retainer || 0}
                                onChange={handleInputChange}
                                className="w-full pl-2 pr-6 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-red-600"
                            />
                             <span className="absolute right-2 top-1 text-slate-400">€</span>
                         </div>
                     </div>
                      <div className="md:col-span-2 mt-2 md:mt-0">
                        <label className="block text-xs font-bold text-slate-700 mb-1">LÍQUIDO A PAGAR</label>
                        <div className="text-lg font-bold text-indigo-600 font-mono text-right">{formatCurrency(amountToPay)}</div>
                      </div>
                  </>
               )}
            </div>

            {activeTab === 'expense' && (
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <input
                        type="checkbox"
                        id="deductible"
                        checked={formData.deductible || false}
                        onChange={(e) => setFormData({...formData, deductible: e.target.checked})}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="deductible" className="text-sm font-medium text-slate-700">Gasto Deducible</label>
                 </div>
                 
                 <Button type="button" variant="secondary" onClick={analyzeExpense} disabled={isAnalyzing}>
                    {isAnalyzing ? 'Analizando...' : <><Wand2 className="h-4 w-4" /> Analizar Deducibilidad</>}
                 </Button>
              </div>
            )}

            {aiAnalysis && (
              <div className={`p-4 rounded-lg text-sm flex items-start gap-3 ${aiAnalysis.deductible ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-bold">{aiAnalysis.deductible ? 'Probablemente Deducible' : 'Probablemente NO Deducible'}</p>
                  <p className="mt-1 opacity-90">{aiAnalysis.reason}</p>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              {activeTab === 'income' && (
                  <>
                    <Button type="button" variant="secondary" onClick={handleGeneratePDF}>
                        <FileText className="h-5 w-5" /> Generar PDF
                    </Button>
                    <Button type="button" variant="secondary" onClick={handleLinkToAEAT} title="Copiar datos y abrir web AEAT">
                        <ExternalLink className="h-5 w-5 text-indigo-600" /> AEAT/Verifactu
                    </Button>
                  </>
              )}
              <Button type="submit" className="flex-1">
                {editingId ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {editingId ? 'Guardar Edición' : 'Guardar Factura'}
              </Button>
              {editingId && (
                  <Button type="button" variant="secondary" onClick={cancelEdit}>
                      Cancelar Edición
                  </Button>
              )}
            </div>
          </form>
        </div>
      )}

      {activeTab === 'list' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            
          {/* Filters & Actions */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
                <Filter className="h-4 w-4 text-slate-500" />
                
                <div className="relative min-w-[80px]">
                    <Calendar className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                    <select 
                        value={filterYear}
                        onChange={(e) => setFilterYear(Number(e.target.value))}
                        className="text-sm border-slate-300 rounded-lg focus:ring-indigo-500 pl-7 pr-2 py-1 w-full"
                        title="Filtrar por Año"
                    >
                        {availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>

                <select 
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="text-sm border-slate-300 rounded-lg focus:ring-indigo-500 min-w-[100px]"
                >
                    <option value="ALL">Todos</option>
                    <option value="INCOME">Ingresos</option>
                    <option value="EXPENSE">Gastos</option>
                </select>

                <input
                    type="text"
                    placeholder="Filtrar categoría..."
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="text-sm border-slate-300 rounded-lg focus:ring-indigo-500 px-2 py-1 min-w-[140px]"
                />

                <input
                    type="text"
                    placeholder="Filtrar Entidad..."
                    value={filterEntity}
                    onChange={(e) => setFilterEntity(e.target.value)}
                    className="text-sm border-slate-300 rounded-lg focus:ring-indigo-500 px-2 py-1 min-w-[140px]"
                />

                <input
                    type="text"
                    placeholder="Filtrar NIF..."
                    value={filterNif}
                    onChange={(e) => setFilterNif(e.target.value)}
                    className="text-sm border-slate-300 rounded-lg focus:ring-indigo-500 px-2 py-1 min-w-[120px]"
                />
                
                {(filterCategory || filterEntity || filterNif || filterType !== 'ALL' || filterYear !== new Date().getFullYear()) && (
                    <button 
                        onClick={() => {
                            setFilterType('ALL');
                            setFilterCategory('');
                            setFilterEntity('');
                            setFilterNif('');
                            setFilterYear(new Date().getFullYear());
                        }}
                        className="flex items-center text-xs text-slate-500 hover:text-indigo-600 underline ml-1"
                        title="Limpiar filtros"
                    >
                        <RotateCcw className="h-3 w-3 mr-1" /> Limpiar
                    </button>
                )}
                
                {/* Save Filter UI */}
                {showSaveFilter ? (
                    <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 ml-2">
                        <input 
                            type="text" 
                            placeholder="Nombre filtro..." 
                            className="text-xs border rounded px-1 py-0.5 w-24"
                            value={newFilterName}
                            onChange={(e) => setNewFilterName(e.target.value)}
                        />
                        <button onClick={handleSaveFilter} className="text-green-600 hover:text-green-700"><Check className="h-4 w-4"/></button>
                        <button onClick={() => setShowSaveFilter(false)} className="text-red-500 hover:text-red-600"><X className="h-4 w-4"/></button>
                    </div>
                ) : (
                     <button onClick={() => setShowSaveFilter(true)} className="p-1 text-slate-400 hover:text-indigo-600 ml-1" title="Guardar Filtro">
                        <Save className="h-4 w-4" />
                     </button>
                )}
            </div>

            <div className="flex gap-2 items-center">
                {selectedIds.size > 0 && (
                    <Button onClick={handleBulkDelete} variant="danger" className="text-xs h-8 animate-in fade-in">
                        <Trash2 className="h-3 w-3" /> Eliminar ({selectedIds.size})
                    </Button>
                )}
                <div className="h-6 w-px bg-slate-300 mx-1 hidden md:block"></div>
                <Button onClick={() => setIsBulkImportOpen(true)} variant="secondary" className="text-xs h-8">
                    <Upload className="h-3 w-3" /> Importar CSV/Excel
                </Button>
                <Button onClick={runAudit} variant="secondary" className="text-xs h-8" disabled={isAuditing}>
                    {isAuditing ? 'Auditando...' : 'Auditar Libros'}
                </Button>
                <Button onClick={exportToCSV} variant="secondary" className="text-xs h-8">
                    <Download className="h-3 w-3" /> Exportar CSV
                </Button>
                <Button onClick={exportToXLS} variant="secondary" className="text-xs h-8">
                    <FileSpreadsheet className="h-3 w-3" /> Exportar Excel
                </Button>
            </div>
          </div>
          
          {/* Saved Filters Chips */}
          {savedFilters.length > 0 && (
              <div className="px-4 py-2 border-b border-slate-100 flex gap-2 flex-wrap">
                  {savedFilters.map((sf, idx) => (
                      <button 
                        key={idx}
                        onClick={() => applySavedFilter(sf)}
                        className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs hover:bg-indigo-100 transition"
                      >
                          <Bookmark className="h-3 w-3" />
                          {sf.name}
                          <span onClick={(e) => deleteSavedFilter(idx, e)} className="ml-1 hover:text-red-500 rounded-full p-0.5"><X className="h-3 w-3"/></span>
                      </button>
                  ))}
              </div>
          )}
            
          {/* Audit Results */}
          {auditResults.length > 0 && (
             <div className="p-4 bg-amber-50 border-b border-amber-100">
                <h4 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4"/> Auditoría IA: Alertas Detectadas
                </h4>
                <ul className="space-y-1">
                    {auditResults.map((alert, i) => (
                        <li key={i} className="text-xs text-amber-700 flex items-start gap-2">
                            <span className={`px-1.5 rounded text-[10px] font-bold ${alert.severity === 'HIGH' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                                {alert.severity}
                            </span>
                            {alert.message} (ID: {alert.invoiceId})
                        </li>
                    ))}
                </ul>
             </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 font-medium">
                <tr>
                  <th className="p-4 w-10 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.size === filteredInvoices.length && filteredInvoices.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                      />
                  </th>
                  <th 
                    className="p-4 min-w-[110px] cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => requestSort('date')}
                  >
                    Fecha {renderSortIcon('date')}
                  </th>
                  <th 
                    className="p-4 min-w-[140px] cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => requestSort('number')}
                  >
                    Número {renderSortIcon('number')}
                  </th>
                  <th 
                    className="p-4 cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => requestSort('entityName')}
                  >
                    Entidad {renderSortIcon('entityName')}
                  </th>
                  <th className="p-4">Concepto</th>
                  <th 
                    className="p-4 cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => requestSort('category')}
                  >
                    Categoría {renderSortIcon('category')}
                  </th>
                  <th 
                    className="p-4 min-w-[120px] text-right cursor-pointer hover:bg-slate-100 select-none"
                    onClick={() => requestSort('baseAmount')}
                  >
                    Base {renderSortIcon('baseAmount')}
                  </th>
                  <th className="p-4 min-w-[110px] text-right">Cuota IVA</th>
                  <th className="p-4 min-w-[110px] text-right">Cuota IRPF</th>
                  <th className="p-4 min-w-[120px] text-right">Total</th>
                  <th className="p-4 text-center">Deducible</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map(inv => (
                  <tr key={inv.id} className={`hover:bg-slate-50 transition-colors group ${selectedIds.has(inv.id) ? 'bg-indigo-50 hover:bg-indigo-100' : ''}`}>
                    <td className="p-4 text-center">
                        <input 
                            type="checkbox" 
                            checked={selectedIds.has(inv.id)}
                            onChange={() => toggleSelection(inv.id)}
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                        />
                    </td>
                    <td className="p-4 text-slate-500 whitespace-nowrap">{formatDate(inv.date)}</td>
                    <td className="p-4 font-medium text-indigo-600 whitespace-nowrap">
                        {inv.number}
                        {inv.supplierNumber && <div className="text-[10px] text-slate-400">Prov: {inv.supplierNumber}</div>}
                    </td>
                    <td className="p-4">
                        <div className="font-medium text-slate-900">{inv.entityName}</div>
                        <div className="text-xs text-slate-400">{inv.nif}</div>
                    </td>
                    <td className="p-4 text-slate-600 max-w-xs truncate">{inv.concept}</td>
                    <td className="p-4">
                        {inv.category && (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs">
                                {inv.category}
                            </span>
                        )}
                    </td>
                    <td className="p-4 text-right font-mono whitespace-nowrap">{formatCurrency(inv.baseAmount)}</td>
                    <td className="p-4 text-right font-mono text-slate-500 whitespace-nowrap">{formatCurrency(inv.ivaAmount)}</td>
                    <td className="p-4 text-right font-mono text-slate-500 whitespace-nowrap">{formatCurrency(inv.irpfAmount)}</td>
                    <td className="p-4 text-right font-bold font-mono whitespace-nowrap">{formatCurrency(inv.totalAmount)}</td>
                    <td className="p-4 text-center">
                        {inv.type === InvoiceType.EXPENSE && (
                            inv.deductible 
                                ? <span className="text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded">SI</span>
                                : <span className="text-red-500 text-xs font-bold bg-red-50 px-2 py-1 rounded">NO</span>
                        )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                            onClick={() => {
                                const targetTab = inv.type === InvoiceType.INCOME ? 'income' : 'expense';
                                setActiveTab(targetTab);
                                // Ensure full data load for editing without reset
                                setFormData({
                                    ...inv,
                                    // Ensure undefined optional fields don't break controlled inputs if any
                                    supplierNumber: inv.supplierNumber || '',
                                    fiscalAddress: inv.fiscalAddress || '',
                                    irpfExpenseType: inv.irpfExpenseType || 'Otros servicios exteriores',
                                    ivaExpenseType: inv.ivaExpenseType || 'Operaciones Interiores Corrientes',
                                    registrationDate: inv.registrationDate || inv.date,
                                    fees: inv.fees || 0,
                                    taxableExpenses: inv.taxableExpenses || 0,
                                    supplies: inv.supplies || 0,
                                    retainer: inv.retainer || 0
                                });
                                setEditingId(inv.id);
                                
                                // Re-validate NIF with relaxed rules for Expense Edit
                                const error = validateSpanishID(inv.nif);
                                if (error) {
                                    if (targetTab === 'expense') {
                                        setNifError(null);
                                        setNifWarning("Aviso: Formato no estándar (Guardado previamente)");
                                    } else {
                                        setNifError(error);
                                    }
                                } else {
                                    setNifError(null);
                                    setNifWarning(null);
                                }
                            }}
                            className="p-1 hover:bg-indigo-50 text-indigo-600 rounded"
                            title="Editar"
                         >
                             <Edit className="h-4 w-4" />
                         </button>
                         <button 
                            onClick={() => setInvoiceToDelete(inv.id)}
                            className="p-1 hover:bg-red-50 text-red-500 rounded"
                            title="Eliminar"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredInvoices.length === 0 && (
                    <tr>
                        <td colSpan={12} className="p-8 text-center text-slate-400">
                            No se encontraron facturas con los filtros actuales.
                        </td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkImportOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
                          Importación Masiva
                      </h3>
                      <button onClick={() => setIsBulkImportOpen(false)} className="text-slate-400 hover:text-slate-600">
                          <X className="h-5 w-5" />
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <p className="text-sm text-slate-600">
                          Sube un archivo <strong>.csv</strong> o <strong>.xlsx</strong> para añadir facturas por lotes.
                      </p>
                      
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Archivo a Subir</label>
                          <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-slate-50 flex-1">
                                    <input 
                                        type="radio" 
                                        name="importType" 
                                        value={InvoiceType.INCOME} 
                                        checked={bulkImportType === InvoiceType.INCOME}
                                        onChange={() => setBulkImportType(InvoiceType.INCOME)}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="font-medium text-slate-700">Facturas Ingresos</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-slate-50 flex-1">
                                    <input 
                                        type="radio" 
                                        name="importType" 
                                        value={InvoiceType.EXPENSE} 
                                        checked={bulkImportType === InvoiceType.EXPENSE}
                                        onChange={() => setBulkImportType(InvoiceType.EXPENSE)}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="font-medium text-slate-700">Facturas Gastos</span>
                                </label>
                          </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-200">
                          <p className="font-semibold mb-1">Columnas esperadas (Excel/CSV):</p>
                          <p>Número, Fecha, NIF, Nombre, Domicilio, Concepto, Categoría, Base, IVA %, IRPF %, Total...</p>
                          {bulkImportType === InvoiceType.EXPENSE && (
                              <p className="mt-1 text-indigo-600 font-medium">+ Deducible, Nº Factura Proveedor, Fecha Registro</p>
                          )}
                      </div>

                      <div className="mt-4">
                          <input 
                              type="file" 
                              ref={bulkFileInputRef}
                              accept=".csv, .xlsx, .xls"
                              onChange={handleBulkImport}
                              className="block w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-indigo-50 file:text-indigo-700
                                hover:file:bg-indigo-100"
                          />
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Context Confirmation Modal */}
      {contextModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
             <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
                 <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                        <HelpCircle className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Revisión de Deducibilidad</h3>
                        <p className="text-sm text-slate-500">Detectado gasto de tipo <span className="font-bold">{pendingImportData?.suggestedContext === 'MEAL' ? 'RESTAURACIÓN' : 'VIAJE'}</span></p>
                    </div>
                 </div>
                 <div className="p-6 space-y-4">
                     <p className="text-slate-700 font-medium text-lg">
                         ¿Está este gasto relacionado con reuniones de clientes o viajes de negocios?
                     </p>
                     <p className="text-slate-500 text-sm">
                        Solo los gastos afectos a la actividad económica son deducibles.
                     </p>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <button 
                            onClick={() => handleContextDecision(true, pendingImportData?.suggestedContext === 'MEAL' ? 'Atenciones a clientes y proveedores' : 'Dietas y Estancias')}
                            className="flex flex-col items-center p-4 border-2 border-slate-100 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group text-center"
                         >
                             {pendingImportData?.suggestedContext === 'MEAL' ? <Utensils className="h-8 w-8 text-slate-400 group-hover:text-indigo-600 mb-2" /> : <Plane className="h-8 w-8 text-slate-400 group-hover:text-indigo-600 mb-2" />}
                             <span className="font-bold text-slate-700 group-hover:text-indigo-700">Sí, es profesional</span>
                             <span className="text-xs text-slate-500 mt-1">Etiquetar como "{pendingImportData?.suggestedContext === 'MEAL' ? 'Atenciones a clientes' : 'Viajes/Dietas'}"</span>
                         </button>
                         <button 
                             onClick={() => handleContextDecision(false)}
                             className="flex flex-col items-center p-4 border-2 border-slate-100 rounded-xl hover:border-red-500 hover:bg-red-50 transition-all group text-center"
                         >
                             <UserPlus className="h-8 w-8 text-slate-400 group-hover:text-red-600 mb-2" />
                             <span className="font-bold text-slate-700 group-hover:text-red-700">No, es personal</span>
                             <span className="text-xs text-slate-500 mt-1">Marcar como No Deducible</span>
                         </button>
                     </div>
                 </div>
             </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Single) */}
      {invoiceToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
             <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                 <div className="flex flex-col items-center text-center gap-4">
                     <div className="p-3 bg-red-100 rounded-full">
                         <AlertTriangle className="h-8 w-8 text-red-600" />
                     </div>
                     <h3 className="text-xl font-bold text-slate-900">¿Eliminar factura?</h3>
                     <p className="text-slate-600">
                         ¿Estás seguro de que deseas eliminar esta factura? Esta acción no se puede deshacer.
                     </p>
                     <div className="flex gap-3 w-full mt-4">
                         <Button variant="secondary" onClick={() => setInvoiceToDelete(null)} className="flex-1">
                             Cancelar
                         </Button>
                         <Button variant="danger" onClick={confirmDelete} className="flex-1">
                             Eliminar
                         </Button>
                     </div>
                 </div>
             </div>
        </div>
      )}

       {/* Bulk Delete Confirmation Modal */}
       {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
             <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                 <div className="flex flex-col items-center text-center gap-4">
                     <div className="p-3 bg-red-100 rounded-full">
                         <Trash2 className="h-8 w-8 text-red-600" />
                     </div>
                     <h3 className="text-xl font-bold text-slate-900">Eliminación Masiva</h3>
                     <p className="text-slate-600">
                         Estás a punto de eliminar <span className="font-bold text-red-600">{selectedIds.size}</span> facturas de forma permanente.
                         <br/><br/>
                         ¿Deseas continuar?
                     </p>
                     <div className="flex gap-3 w-full mt-4">
                         <Button variant="secondary" onClick={() => setShowBulkDeleteConfirm(false)} className="flex-1">
                             Cancelar
                         </Button>
                         <Button variant="danger" onClick={confirmBulkDelete} className="flex-1">
                             Sí, Eliminar Todo
                         </Button>
                     </div>
                 </div>
             </div>
        </div>
      )}

    </div>
  );
};