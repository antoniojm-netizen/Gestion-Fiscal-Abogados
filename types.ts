
export enum InvoiceType {
  INCOME = 'INCOME', // Ingreso (Factura Emitida)
  EXPENSE = 'EXPENSE' // Gasto (Factura Recibida)
}

export interface Invoice {
  id: string;
  number: string; // Número de factura (Ingresos) o Número de Registro Interno (Gastos)
  date: string; // Fecha de factura
  type: InvoiceType;
  concept: string;
  nif: string; // NIF/CIF del cliente o proveedor
  entityName: string; // Nombre del cliente o proveedor
  fiscalAddress?: string; // Domicilio Fiscal
  
  // Breakdown fields for Income
  fees?: number; // Honorarios
  taxableExpenses?: number; // Gastos que forman parte de la base
  supplies?: number; // Suplidos (Exentos de IVA/IRPF, se suman al total)
  
  baseAmount: number; // Base Imponible (Calculated or direct)
  ivaRate: number; // % IVA
  ivaAmount: number; // Cuota IVA
  irpfRate: number; // % IRPF (Retención)
  irpfAmount: number; // Cuota IRPF
  totalAmount: number; // Total Factura
  
  retainer?: number; // Provisión de Fondos (Restar del total)

  deductible?: boolean; // Solo para gastos
  category?: string; // Categoría libre (etiqueta)
  
  // Nuevos campos para Facturas Recibidas (Gastos)
  supplierNumber?: string; // Número factura del proveedor
  registrationDate?: string; // Fecha de registro contable
  
  // Nuevos campos fiscales específicos
  irpfIncomeType?: string; // Tipo de Ingreso IRPF (Ej: Prestación servicios)
  irpfExpenseType?: string; // Tipo de Gasto IRPF (Ej: Arrendamientos, Suministros)
  ivaExpenseType?: string; // Tipo de Gasto IVA (Ej: Corriente, Bien de Inversión)
}

export interface SavedEntity {
  internalId?: string; // C-X (Client) or P-X (Provider)
  name: string;
  nif: string;
  fiscalAddress: string;
  type: 'CLIENT' | 'PROVIDER';
  email?: string;
  phone?: string;
  contactPerson?: string;
  notes?: string;
}

export interface ProfessionalProfile {
  name: string;
  nif: string;
  address: string;
  city: string;
  zipCode: string;
  province: string;
  barAssociation: string; // Colegio Profesional
  collegiateNumber: string; // Número de colegiado
  phone: string;
  email: string;
  website: string;
  iban?: string; // Cuenta bancaria
}

export interface TaxSummary {
  model303: {
    devengado: number; // IVA Repercutido
    soportado: number; // IVA Soportado
    result: number;
  };
  model130: {
    income: number;
    expenses: number;
    netYield: number;
    taxDue: number; // 20% del rendimiento neto
  };
  model111: {
    withheldAmount: number; // Total retenido a profesionales/trabajadores
  };
  model347: {
    operations: Array<{ nif: string; name: string; total: number }>;
  };
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}
