import React from 'react';
import { Invoice, InvoiceType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Wallet, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface DashboardProps {
  invoices: Invoice[];
}

export const Dashboard: React.FC<DashboardProps> = ({ invoices }) => {
  const currentYear = new Date().getFullYear();
  
  const incomeInvoices = invoices.filter(inv => inv.type === InvoiceType.INCOME);
  const expenseInvoices = invoices.filter(inv => inv.type === InvoiceType.EXPENSE);

  const totalIncome = incomeInvoices.reduce((sum, inv) => sum + inv.baseAmount, 0);
  const totalExpenses = expenseInvoices.filter(i => i.deductible).reduce((sum, inv) => sum + inv.baseAmount, 0);
  const netProfit = totalIncome - totalExpenses;
  
  const totalIVACollected = incomeInvoices.reduce((sum, inv) => sum + inv.ivaAmount, 0);
  const totalIVAPaid = expenseInvoices.filter(i => i.deductible).reduce((sum, inv) => sum + inv.ivaAmount, 0);
  const estimatedIVA = totalIVACollected - totalIVAPaid;

  // Prepare data for bar charts (Monthly)
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = i;
    
    // Filter lists for this month/year
    const monthIncomes = incomeInvoices.filter(inv => new Date(inv.date).getMonth() === month && new Date(inv.date).getFullYear() === currentYear);
    const monthExpenses = expenseInvoices.filter(inv => new Date(inv.date).getMonth() === month && new Date(inv.date).getFullYear() === currentYear && inv.deductible);

    // Calculate Base Amounts
    const monthIncomeBase = monthIncomes.reduce((sum, inv) => sum + inv.baseAmount, 0);
    const monthExpenseBase = monthExpenses.reduce((sum, inv) => sum + inv.baseAmount, 0);
    
    // Calculate Tax Amounts
    const monthIvaRepercutido = monthIncomes.reduce((sum, inv) => sum + inv.ivaAmount, 0);
    const monthIvaSoportado = monthExpenses.reduce((sum, inv) => sum + inv.ivaAmount, 0);

    return {
      name: new Date(2000, i, 1).toLocaleString('es-ES', { month: 'short' }),
      Ingresos: monthIncomeBase,
      Gastos: monthExpenseBase,
      Repercutido: monthIvaRepercutido,
      Soportado: monthIvaSoportado
    };
  });

  const pieData = [
    { name: 'Ingresos', value: totalIncome },
    { name: 'Gastos', value: totalExpenses },
  ];
  const COLORS = ['#4f46e5', '#ef4444'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Beneficio Neto</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">{netProfit.toFixed(2)} €</h3>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <Wallet className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mt-2 text-xs text-green-600 font-medium">Acumulado {currentYear}</div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Ingresos Totales</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">{totalIncome.toFixed(2)} €</h3>
            </div>
            <div className="p-2 bg-indigo-50 rounded-lg">
              <TrendingUp className="h-6 w-6 text-indigo-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Gastos Deducibles</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">{totalExpenses.toFixed(2)} €</h3>
            </div>
            <div className="p-2 bg-red-50 rounded-lg">
              <TrendingDown className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">IVA a Pagar (Est.)</p>
              <h3 className={`text-2xl font-bold mt-1 ${estimatedIVA > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {estimatedIVA.toFixed(2)} €
              </h3>
            </div>
            <div className="p-2 bg-orange-50 rounded-lg">
              <AlertCircle className="h-6 w-6 text-orange-600" />
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-400">Modelo 303 (Trimestral)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Evolución Ingresos vs Gastos (Base)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                  cursor={{fill: '#f1f5f9'}}
                />
                <Legend />
                <Bar dataKey="Ingresos" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Ingresos (Base)" />
                <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} name="Gastos (Base)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Distribución</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* New Chart: VAT Analysis */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6">
             <h3 className="text-lg font-semibold text-slate-800">Análisis de IVA: Repercutido vs Soportado</h3>
             <div className="flex gap-4 text-sm mt-2 md:mt-0">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <span className="text-slate-600">Repercutido (A pagar)</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <span className="text-slate-600">Soportado (A deducir)</span>
                </div>
             </div>
          </div>
          
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                  cursor={{fill: '#f1f5f9'}}
                  formatter={(value: number) => [`${value.toFixed(2)} €`, '']}
                />
                <Bar dataKey="Repercutido" fill="#f59e0b" radius={[4, 4, 0, 0]} name="IVA Repercutido" />
                <Bar dataKey="Soportado" fill="#10b981" radius={[4, 4, 0, 0]} name="IVA Soportado" />
              </BarChart>
            </ResponsiveContainer>
          </div>
      </div>
    </div>
  );
};