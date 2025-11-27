import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Invoice, InvoiceType, SavedEntity } from '../types';

// Helper to normalize dates (Excel Serial or String DD/MM/YYYY or YYYY-MM-DD)
const normalizeDate = (value: any): string => {
  if (!value) return new Date().toISOString().split('T')[0];

  // Excel Serial Date
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }

  // String Date
  if (typeof value === 'string') {
    // DD/MM/YYYY
    if (value.includes('/')) {
      const parts = value.split('/');
      if (parts.length === 3) {
        // Assume DD/MM/YYYY
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    // YYYY-MM-DD
    if (value.includes('-')) return value;
  }

  return new Date().toISOString().split('T')[0];
};

// Helper to normalize numbers (handle comma as decimal separator)
const normalizeNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove currency symbols and handle commas
    const clean = value.replace(/[^0-9,.-]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  }
  return 0;
};

// Helper to normalize boolean (SI/NO, TRUE/FALSE, 1/0)
const normalizeBoolean = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.toUpperCase().trim();
    return v === 'SI' || v === 'SÍ' || v === 'YES' || v === 'TRUE' || v === '1';
  }
  if (typeof value === 'number') return value === 1;
  return false;
};

const mapRowToInvoice = (row: any, type: InvoiceType): Invoice => {
  // Common Fields
  const id = crypto.randomUUID();
  // Try to find columns by common names (case insensitive)
  const getCol = (keys: string[]) => {
    const foundKey = Object.keys(row).find(k => keys.some(key => k.toLowerCase().includes(key.toLowerCase())));
    return foundKey ? row[foundKey] : undefined;
  };

  const number = getCol(['Número', 'Numero', 'Nº Factura', 'Ref', 'Número Interno']) || `IMP-${Date.now()}`;
  const date = normalizeDate(getCol(['Fecha', 'Date', 'Emisión', 'Fecha Factura']));
  
  // Entity (Client or Provider)
  const nif = getCol(['NIF', 'CIF', 'DNI', 'Identificación']) || '';
  const entityName = getCol(['Nombre', 'Razón Social', 'Cliente', 'Proveedor', 'Entidad']) || 'Desconocido';
  const fiscalAddress = getCol(['Domicilio', 'Dirección', 'Direccion']) || '';
  
  const concept = getCol(['Concepto', 'Descripción']) || 'Importado';
  const category = getCol(['Categoría', 'Categoria']) || '';
  
  // Amounts
  const baseAmount = normalizeNumber(getCol(['Base', 'Imponible', 'Subtotal']));
  const ivaRate = normalizeNumber(getCol(['IVA %', '% IVA', 'Tipo IVA'])) || 21;
  const irpfRate = normalizeNumber(getCol(['IRPF %', '% IRPF', 'Retención'])) || 0;
  
  // Calculate amounts if not present
  let ivaAmount = normalizeNumber(getCol(['Cuota IVA', 'Importe IVA']));
  if (!ivaAmount) ivaAmount = baseAmount * (ivaRate / 100);

  let irpfAmount = normalizeNumber(getCol(['Cuota IRPF', 'Importe IRPF', 'Retención']));
  if (!irpfAmount) irpfAmount = baseAmount * (irpfRate / 100);

  let totalAmount = normalizeNumber(getCol(['Total', 'Importe Total']));
  if (!totalAmount) {
     totalAmount = type === InvoiceType.INCOME 
        ? baseAmount + ivaAmount - irpfAmount 
        : baseAmount + ivaAmount - irpfAmount; // Simplified logic, usually same formula
  }

  const invoice: Invoice = {
    id,
    type,
    number: String(number),
    date,
    nif: String(nif),
    entityName: String(entityName),
    fiscalAddress: String(fiscalAddress),
    concept: String(concept),
    category: String(category),
    baseAmount,
    ivaRate,
    ivaAmount,
    irpfRate,
    irpfAmount,
    totalAmount
  };

  if (type === InvoiceType.INCOME) {
    invoice.irpfIncomeType = getCol(['Tipo de ingreso', 'Tipo Ingreso']) || 'Prestación de servicios';
  } else {
    invoice.supplierNumber = getCol(['Nº Factura Proveedor', 'Ref Proveedor', 'Supplier Num']) || '';
    invoice.registrationDate = normalizeDate(getCol(['Fecha Registro', 'Registro']));
    invoice.irpfExpenseType = getCol(['Tipo Gasto IRPF', 'Tipo IRPF']) || 'Otros servicios exteriores';
    invoice.ivaExpenseType = getCol(['Tipo Gasto IVA', 'Tipo IVA Gasto']) || 'Operaciones Interiores Corrientes';
    invoice.deductible = normalizeBoolean(getCol(['Deducible', 'Gasto deducible']));
  }

  return invoice;
};

const mapRowToContact = (row: any): SavedEntity => {
  const getCol = (keys: string[]) => {
    const foundKey = Object.keys(row).find(k => keys.some(key => k.toLowerCase().includes(key.toLowerCase())));
    return foundKey ? row[foundKey] : undefined;
  };

  const typeRaw = getCol(['Tipo', 'Type', 'Rol']) || '';
  const type: 'CLIENT' | 'PROVIDER' = 
    String(typeRaw).toUpperCase().includes('PROV') || String(typeRaw).toUpperCase().includes('SUPPLIER') 
      ? 'PROVIDER' 
      : 'CLIENT'; // Default to Client

  const name = getCol(['Nombre', 'Razón Social', 'Name', 'Empresa']) || 'Desconocido';
  const nif = getCol(['NIF', 'CIF', 'DNI', 'Tax ID']) || '';
  const fiscalAddress = getCol(['Domicilio', 'Dirección', 'Address']) || '';
  const email = getCol(['Email', 'Correo', 'Mail']) || '';
  const phone = getCol(['Teléfono', 'Telefono', 'Phone', 'Móvil']) || '';
  const notes = getCol(['Notas', 'Observaciones', 'Notes', 'Comentarios']) || '';

  return {
    type,
    name: String(name),
    nif: String(nif),
    fiscalAddress: String(fiscalAddress),
    email: String(email),
    phone: String(phone),
    notes: String(notes)
  };
};

export const parseFile = async (file: File, type: InvoiceType): Promise<Invoice[]> => {
  return new Promise((resolve, reject) => {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const isExcel = file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsx');

    if (isCsv) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const invoices = results.data.map((row: any) => mapRowToInvoice(row, type));
            resolve(invoices);
          } catch (e) {
            reject(e);
          }
        },
        error: (error) => reject(error)
      });
    } else if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          const invoices = jsonData.map((row: any) => mapRowToInvoice(row, type));
          resolve(invoices);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    } else {
      reject(new Error("Formato no soportado. Use CSV o Excel."));
    }
  });
};

export const parseContactsFile = async (file: File): Promise<SavedEntity[]> => {
  return new Promise((resolve, reject) => {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const isExcel = file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsx');

    const processRows = (rows: any[]) => {
      try {
        const contacts = rows.map(row => mapRowToContact(row)).filter(c => c.name && c.nif); // Basic validation
        resolve(contacts);
      } catch (e) {
        reject(e);
      }
    };

    if (isCsv) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processRows(results.data),
        error: (error) => reject(error)
      });
    } else if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          processRows(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    } else {
      reject(new Error("Formato no soportado. Use CSV o Excel."));
    }
  });
};