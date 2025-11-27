
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SavedEntity } from '../types';
import { Search, Plus, Trash2, Edit, X, User, Briefcase, MapPin, Building, Phone, Mail, FileText, AlertCircle, Upload, FileSpreadsheet, Hash, ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { parseContactsFile } from '../services/importService';

// Validation Helper for Spanish IDs
const validateSpanishID = (value: string): string | null => {
  if (!value) return null;
  const str = value.toUpperCase().trim();
  
  const validChars = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const nifRegex = /^[0-9]{8}[A-Z]$/;
  const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/;
  const cifRegex = /^[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J]$/;

  // DNI (NIF) Validation
  if (nifRegex.test(str)) {
    const number = parseInt(str.substr(0, 8), 10);
    const letter = str.charAt(8);
    const expectedLetter = validChars.charAt(number % 23);
    if (letter !== expectedLetter) return `NIF incorrecto: La letra debería ser ${expectedLetter}`;
    return null;
  }

  // NIE Validation
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

  return "Formato no estándar (DNI, CIF o NIE). Se guardará con advertencia.";
};

export const ContactsManager: React.FC = () => {
  const [contacts, setContacts] = useState<SavedEntity[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('savedEntities') || '[]');
    } catch {
      return [];
    }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'CLIENT' | 'PROVIDER'>('ALL');
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: keyof SavedEntity; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // Warning state instead of blocking error
  const [nifWarning, setNifWarning] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<SavedEntity>({
    internalId: '',
    name: '',
    nif: '',
    fiscalAddress: '',
    type: 'CLIENT',
    email: '',
    phone: '',
    contactPerson: '',
    notes: ''
  });

  // Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('savedEntities', JSON.stringify(contacts));
  }, [contacts]);

  const requestSort = (key: keyof SavedEntity) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredContacts = useMemo(() => {
    // 1. Filter
    let result = contacts.filter(contact => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        contact.name.toLowerCase().includes(term) || 
        contact.nif.toLowerCase().includes(term) ||
        (contact.email && contact.email.toLowerCase().includes(term)) ||
        (contact.phone && contact.phone.includes(term)) ||
        (contact.internalId && contact.internalId.toLowerCase().includes(term)) ||
        (contact.contactPerson && contact.contactPerson.toLowerCase().includes(term));
      
      const matchesType = filterType === 'ALL' || contact.type === filterType;

      return matchesSearch && matchesType;
    });

    // 2. Sort
    result.sort((a, b) => {
        let aValue = (a[sortConfig.key] || '').toString().toLowerCase();
        let bValue = (b[sortConfig.key] || '').toString().toLowerCase();

        // Special handling for internalId to sort naturally (C-2 before C-10)
        if (sortConfig.key === 'internalId') {
             return sortConfig.direction === 'asc' 
                ? aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' })
                : bValue.localeCompare(aValue, undefined, { numeric: true, sensitivity: 'base' });
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
  }, [contacts, searchTerm, filterType, sortConfig]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newType = e.target.value as 'CLIENT' | 'PROVIDER';
      
      // If changing type, check if we need to reset the Internal ID so a new one is generated
      // corresponding to the new type (C-X vs P-X)
      let newInternalId = formData.internalId;
      
      // Only reset if an ID exists and it mismatches the new type prefix
      if (formData.internalId) {
          const isCurrentlyClient = formData.internalId.startsWith('C-');
          const isCurrentlyProvider = formData.internalId.startsWith('P-');
          
          if (newType === 'CLIENT' && isCurrentlyProvider) {
              newInternalId = ''; // Will generate new C-X on save
          } else if (newType === 'PROVIDER' && isCurrentlyClient) {
              newInternalId = ''; // Will generate new P-X on save
          }
      }

      setFormData({ 
          ...formData, 
          type: newType,
          internalId: newInternalId
      });
  };

  const handleNifChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.toUpperCase();
      setFormData({ ...formData, nif: val });
      // Clear warning immediately when user modifies input
      if (nifWarning) setNifWarning(null);
  };

  const handleNifBlur = () => {
      const error = validateSpanishID(formData.nif);
      // Instead of blocking error, we set a warning but allow saving
      setNifWarning(error); 
  };

  const generateInternalId = (type: 'CLIENT' | 'PROVIDER') => {
      const prefix = type === 'CLIENT' ? 'C' : 'P';
      const relevant = contacts.filter(c => c.type === type && c.internalId?.startsWith(prefix));
      
      const maxId = relevant.reduce((max, c) => {
          if (!c.internalId) return max;
          const numPart = parseInt(c.internalId.split('-')[1]);
          return isNaN(numPart) ? max : Math.max(max, numPart);
      }, 0);
      
      return `${prefix}-${maxId + 1}`;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.nif) return;

    // We check validation to ensure the warning state is up to date, 
    // BUT we do NOT block the save process anymore.
    const error = validateSpanishID(formData.nif);
    if (error) {
        setNifWarning(error);
        // Continue execution (allow save) even if there is a warning
    }

    if (editingIndex !== null) {
      // Update Mode with Confirmation
      if (window.confirm(`¿Estás seguro de que deseas modificar los datos de "${formData.name}"?`)) {
        const updated = [...contacts];
        // Ensure internal ID is kept or generated if missing (e.g. if type changed)
        const finalData = { ...formData };
        if (!finalData.internalId) {
            finalData.internalId = generateInternalId(finalData.type);
        }
        updated[editingIndex] = finalData;
        setContacts(updated);
      } else {
        return; // User cancelled
      }
    } else {
      // Create Mode
      // Check for duplicates
      if (contacts.some(c => c.nif === formData.nif)) {
        if (!window.confirm("Ya existe un contacto con este NIF. ¿Quieres guardarlo de todas formas?")) {
            return;
        }
      }
      
      const newContact = { ...formData };
      if (!newContact.internalId) {
          newContact.internalId = generateInternalId(newContact.type);
      }
      
      setContacts([...contacts, newContact]);
    }
    closeModal();
  };

  const handleDelete = (nif: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este contacto de la base de datos?')) {
      setContacts(contacts.filter(c => c.nif !== nif));
    }
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        const newContacts = await parseContactsFile(file);
        
        if (newContacts.length === 0) {
            alert("No se encontraron contactos válidos en el archivo.");
            return;
        }

        const newCount = newContacts.length;
        if (window.confirm(`Se han encontrado ${newCount} contactos. ¿Deseas importarlos a la agenda?`)) {
            setContacts(prev => {
               // Assign Internal IDs to imported contacts that might lack them
               
               const existingNifs = new Set(prev.map(c => c.nif));
               const uniqueNew = newContacts.filter(c => !existingNifs.has(c.nif));
               const duplicates = newCount - uniqueNew.length;
               
               // Assign IDs to new ones
               let clientCounter = prev.filter(c => c.type === 'CLIENT' && c.internalId?.startsWith('C-')).length;
               let providerCounter = prev.filter(c => c.type === 'PROVIDER' && c.internalId?.startsWith('P-')).length;
               
               const finalizedNew = uniqueNew.map(c => {
                   if (c.type === 'CLIENT') {
                       clientCounter++;
                       return { ...c, internalId: `C-${clientCounter}` };
                   } else {
                       providerCounter++;
                       return { ...c, internalId: `P-${providerCounter}` };
                   }
               });

               if (duplicates > 0) {
                   alert(`Se han omitido ${duplicates} contactos que ya existían (por NIF).`);
               }
               
               return [...prev, ...finalizedNew];
            });
            setIsImportModalOpen(false);
        }

    } catch (error: any) {
        console.error(error);
        alert(`Error al importar: ${error.message}`);
    } finally {
        if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
  };

  const openModal = (contact?: SavedEntity, index?: number) => {
    setNifWarning(null);
    if (contact && index !== undefined) {
      setFormData(contact);
      setEditingIndex(index);
      // Run validation on open to show warning if editing an existing non-standard NIF
      const error = validateSpanishID(contact.nif);
      if (error) setNifWarning(error);
    } else {
      setFormData({
        internalId: '',
        name: '',
        nif: '',
        fiscalAddress: '',
        type: 'CLIENT',
        email: '',
        phone: '',
        contactPerson: '',
        notes: ''
      });
      setEditingIndex(null);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingIndex(null);
    setNifWarning(null);
  };

  const renderSortIcon = (columnKey: keyof SavedEntity) => {
      if (sortConfig.key !== columnKey) return <ArrowUpDown className="h-3 w-3 text-slate-300 ml-1 inline" />;
      return sortConfig.direction === 'asc' 
          ? <ArrowUp className="h-3 w-3 text-indigo-600 ml-1 inline" />
          : <ArrowDown className="h-3 w-3 text-indigo-600 ml-1 inline" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building className="h-6 w-6 text-indigo-600" />
            Agenda de Contactos
          </h2>
          <p className="text-sm text-slate-500">Base de datos de Clientes y Proveedores</p>
        </div>
        <div className="flex gap-3">
            <Button onClick={() => setIsImportModalOpen(true)} variant="secondary">
                <Upload className="h-5 w-5" /> Importar CSV/Excel
            </Button>
            <Button onClick={() => openModal()}>
                <Plus className="h-5 w-5" /> Nuevo Contacto
            </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por Nombre, NIF, ID, Email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={() => setFilterType('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterType === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                    Todos
                </button>
                <button 
                    onClick={() => setFilterType('CLIENT')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterType === 'CLIENT' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                    Clientes
                </button>
                <button 
                    onClick={() => setFilterType('PROVIDER')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterType === 'PROVIDER' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                    Proveedores
                </button>
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 font-medium">
                    <tr>
                        <th 
                            className="p-4 cursor-pointer hover:bg-slate-100 select-none"
                            onClick={() => requestSort('internalId')}
                        >
                            ID {renderSortIcon('internalId')}
                        </th>
                        <th 
                            className="p-4 cursor-pointer hover:bg-slate-100 select-none"
                            onClick={() => requestSort('type')}
                        >
                            Tipo {renderSortIcon('type')}
                        </th>
                        <th 
                            className="p-4 cursor-pointer hover:bg-slate-100 select-none"
                            onClick={() => requestSort('name')}
                        >
                            Nombre / Razón Social {renderSortIcon('name')}
                        </th>
                        <th 
                            className="p-4 cursor-pointer hover:bg-slate-100 select-none"
                            onClick={() => requestSort('nif')}
                        >
                            NIF / CIF {renderSortIcon('nif')}
                        </th>
                        <th className="p-4">Datos Contacto</th>
                        <th 
                            className="p-4 cursor-pointer hover:bg-slate-100 select-none"
                            onClick={() => requestSort('fiscalAddress')}
                        >
                            Domicilio Fiscal {renderSortIcon('fiscalAddress')}
                        </th>
                        <th className="p-4 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredContacts.map((contact, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                            <td className="p-4 font-mono text-xs text-slate-500">
                                {contact.internalId || '-'}
                            </td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${contact.type === 'CLIENT' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {contact.type === 'CLIENT' ? 'CLIENTE' : 'PROVEEDOR'}
                                </span>
                            </td>
                            <td className="p-4">
                                <div className="font-medium text-slate-900">{contact.name}</div>
                                {contact.contactPerson && (
                                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                        <User className="h-3 w-3" /> {contact.contactPerson}
                                    </div>
                                )}
                            </td>
                            <td className="p-4 text-slate-600 font-mono">{contact.nif}</td>
                            <td className="p-4">
                                <div className="space-y-1">
                                    {contact.email && <div className="flex items-center gap-1 text-slate-500 text-xs"><Mail className="h-3 w-3"/> {contact.email}</div>}
                                    {contact.phone && <div className="flex items-center gap-1 text-slate-500 text-xs"><Phone className="h-3 w-3"/> {contact.phone}</div>}
                                </div>
                            </td>
                            <td className="p-4 text-slate-600 max-w-xs truncate">{contact.fiscalAddress}</td>
                            <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => openModal(contact, contacts.indexOf(contact))} // Find real index in full array
                                        className="p-1 hover:bg-indigo-50 text-indigo-600 rounded"
                                        title="Editar"
                                    >
                                        <Edit className="h-4 w-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(contact.nif)}
                                        className="p-1 hover:bg-red-50 text-red-500 rounded"
                                        title="Eliminar"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {filteredContacts.length === 0 && (
                        <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400">
                                No se encontraron contactos.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
                          Importación Masiva de Contactos
                      </h3>
                      <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                          <X className="h-5 w-5" />
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <p className="text-sm text-slate-600">
                          Sube un archivo <strong>.csv</strong> o <strong>.xlsx</strong> con tus clientes y proveedores.
                      </p>

                      <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-200">
                          <p className="font-semibold mb-1">Columnas soportadas:</p>
                          <p>Tipo (Cliente/Proveedor), Nombre/Razón Social, NIF, Contacto, Domicilio, Email, Teléfono, Notas.</p>
                      </div>

                      <div className="mt-4">
                          <input 
                              type="file" 
                              ref={importFileInputRef}
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

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">
                        {editingIndex !== null ? 'Editar Contacto' : 'Nuevo Contacto'}
                    </h3>
                    <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5"/></button>
                </div>
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    
                    {/* Internal ID Display */}
                    {formData.internalId && (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center gap-2">
                            <Hash className="h-4 w-4 text-slate-400"/>
                            <span className="text-sm text-slate-500">Nº Registro Interno:</span>
                            <span className="font-mono font-bold text-slate-700">{formData.internalId}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                         <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Entidad</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="type" 
                                        value="CLIENT" 
                                        checked={formData.type === 'CLIENT'} 
                                        onChange={handleTypeChange}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm">Cliente</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="type" 
                                        value="PROVIDER" 
                                        checked={formData.type === 'PROVIDER'} 
                                        onChange={handleTypeChange}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm">Proveedor</span>
                                </label>
                            </div>
                         </div>
                         <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre / Razón Social</label>
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    required
                                    placeholder="Ej: Juan Pérez o Empresa S.L."
                                />
                            </div>
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">NIF / CIF</label>
                            <div className="relative">
                                <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    name="nif"
                                    value={formData.nif}
                                    onChange={handleNifChange}
                                    onBlur={handleNifBlur}
                                    className={`w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${nifWarning ? 'border-yellow-500 focus:ring-yellow-200' : 'border-slate-300 focus:ring-indigo-500'}`}
                                    required
                                    placeholder="12345678Z"
                                />
                            </div>
                            {nifWarning && (
                                <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1 font-medium">
                                    <AlertTriangle className="h-3 w-3" /> {nifWarning}
                                </p>
                            )}
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Persona de Contacto</label>
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    name="contactPerson"
                                    value={formData.contactPerson || ''}
                                    onChange={handleInputChange}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Ej: María Gómez"
                                />
                            </div>
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    name="phone"
                                    value={formData.phone || ''}
                                    onChange={handleInputChange}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="600 000 000"
                                />
                            </div>
                         </div>
                         <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email || ''}
                                    onChange={handleInputChange}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="correo@ejemplo.com"
                                />
                            </div>
                         </div>
                         <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Domicilio Fiscal</label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    name="fiscalAddress"
                                    value={formData.fiscalAddress}
                                    onChange={handleInputChange}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Dirección completa"
                                />
                            </div>
                         </div>
                         <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Notas Internas</label>
                            <div className="relative">
                                <div className="absolute left-3 top-2.5 pointer-events-none">
                                    <FileText className="h-4 w-4 text-slate-400" />
                                </div>
                                <textarea
                                    name="notes"
                                    value={formData.notes || ''}
                                    onChange={handleInputChange}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    rows={3}
                                    placeholder="Información adicional, cuenta bancaria, observaciones..."
                                />
                            </div>
                         </div>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-slate-100">
                        <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">Cancelar</Button>
                        <Button type="submit" className="flex-1">
                            {editingIndex !== null ? 'Actualizar Contacto' : 'Guardar Contacto'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
