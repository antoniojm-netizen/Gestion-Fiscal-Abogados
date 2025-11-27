
import React, { useMemo, useState } from 'react';
import { Invoice, InvoiceType, ProfessionalProfile } from '../types';
import { Lock, FileText, AlertTriangle, CheckCircle, Calendar, ArrowRight } from 'lucide-react';
import { Button } from './Button';
import { generateFiscalYearReport } from '../services/pdfGenerator';

interface FiscalYearCloserProps {
    invoices: Invoice[];
}

// Helper for European Currency Format
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
};

export const FiscalYearCloser: React.FC<FiscalYearCloserProps> = ({ invoices }) => {
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    
    // Get available years from invoices
    const availableYears = useMemo(() => {
        const years = new Set(invoices.map(inv => new Date(inv.date).getFullYear()));
        return Array.from(years).sort((a: number, b: number) => b - a);
    }, [invoices]);

    // Calculate stats for selected year
    const stats = useMemo(() => {
        const yearInvoices = invoices.filter(inv => new Date(inv.date).getFullYear() === selectedYear);
        const incomes = yearInvoices.filter(i => i.type === InvoiceType.INCOME);
        const expenses = yearInvoices.filter(i => i.type === InvoiceType.EXPENSE && i.deductible);

        return {
            count: yearInvoices.length,
            incomeTotal: incomes.reduce((sum, i) => sum + i.baseAmount, 0),
            expenseTotal: expenses.reduce((sum, i) => sum + i.baseAmount, 0),
            vatResult: incomes.reduce((sum, i) => sum + i.ivaAmount, 0) - expenses.reduce((sum, i) => sum + i.ivaAmount, 0),
            irpfSuffered: incomes.reduce((sum, i) => sum + i.irpfAmount, 0)
        };
    }, [invoices, selectedYear]);

    const handleCloseYear = () => {
        const savedProfile = localStorage.getItem('professionalProfile');
        const profile: ProfessionalProfile = savedProfile ? JSON.parse(savedProfile) : { name: '' } as any;

        if (!profile.name) {
            alert("Por favor, configura primero tus 'Datos del Profesional' para generar el informe.");
            return;
        }

        if (window.confirm(`¿Deseas generar el Informe de Cierre del año ${selectedYear}?\n\nEsto generará un PDF con todos los totales fiscales.`)) {
            generateFiscalYearReport(selectedYear, invoices, profile);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-slate-100 rounded-lg">
                        <Lock className="h-6 w-6 text-slate-700" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Cierre de Ejercicio Fiscal</h2>
                        <p className="text-sm text-slate-500">Generación de informes anuales y consolidación de datos.</p>
                    </div>
                </div>

                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-8">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div>
                            <p className="text-sm text-amber-800 font-medium">Información sobre la numeración</p>
                            <p className="text-sm text-amber-700 mt-1">
                                El sistema de facturación reinicia automáticamente la numeración al cambiar de año en la fecha de la factura.
                                Por ejemplo, la primera factura de {selectedYear + 1} tendrá el número <strong>A-{(selectedYear + 1).toString().slice(-2)}-1</strong>.
                                No es necesario realizar ninguna acción técnica adicional para reiniciar los contadores.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Selecciona el Año a Cerrar</label>
                        <div className="flex gap-4 items-center">
                             <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <select 
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                                    className="pl-9 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none bg-white min-w-[120px]"
                                >
                                    {availableYears.length > 0 ? (
                                        availableYears.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))
                                    ) : (
                                        <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                                    )}
                                </select>
                             </div>
                        </div>

                        <div className="mt-6 space-y-4">
                            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                <span className="text-slate-600 text-sm">Registros Totales</span>
                                <span className="font-mono font-bold text-slate-800">{stats.count}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-lg">
                                <span className="text-indigo-700 text-sm">Ingresos Computables</span>
                                <span className="font-mono font-bold text-indigo-800">{formatCurrency(stats.incomeTotal)}</span>
                            </div>
                             <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                                <span className="text-red-700 text-sm">Gastos Deducibles</span>
                                <span className="font-mono font-bold text-red-800">{formatCurrency(stats.expenseTotal)}</span>
                            </div>
                             <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg">
                                <span className="text-emerald-700 text-sm">Rendimiento Neto</span>
                                <span className="font-mono font-bold text-emerald-800">{formatCurrency(stats.incomeTotal - stats.expenseTotal)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col justify-center items-center border-2 border-dashed border-slate-200 rounded-xl p-6 text-center space-y-4">
                         <FileText className="h-12 w-12 text-indigo-300" />
                         <div>
                             <h3 className="font-bold text-slate-700">Informe de Cierre {selectedYear}</h3>
                             <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                                 Incluye desglose de IVA Repercutido/Soportado, Retenciones, Ingresos y Gastos detallados para el Modelo 390 y 130.
                             </p>
                         </div>
                         <Button onClick={handleCloseYear} className="w-full max-w-xs">
                             <CheckCircle className="h-4 w-4" /> Cerrar Año y Generar PDF
                         </Button>
                    </div>
                </div>
             </div>
        </div>
    );
};
