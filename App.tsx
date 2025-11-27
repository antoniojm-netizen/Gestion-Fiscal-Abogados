
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Receipt, Scale, MessageSquare, Menu, Users, UserCog } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { InvoiceManager } from './components/InvoiceManager';
import { TaxModels } from './components/TaxModels';
import { ChatBot } from './components/ChatBot';
import { ContactsManager } from './components/ContactsManager';
import { ProfessionalProfile } from './components/ProfessionalProfile';
import { Invoice, InvoiceType } from './types';

// Mock Initial Data
const INITIAL_INVOICES: Invoice[] = [
  { 
      id: '1', 
      type: InvoiceType.INCOME, 
      number: 'A-2024-001', 
      date: '2024-01-15', 
      concept: 'Asesoría Divorcio', 
      nif: '12345678Z', 
      entityName: 'Juan Pérez', 
      fiscalAddress: 'C/ Mayor 1, Madrid', 
      baseAmount: 1000, 
      ivaRate: 21, 
      ivaAmount: 210, 
      irpfRate: 15, 
      irpfAmount: 150, 
      totalAmount: 1060,
      irpfIncomeType: 'Prestación de servicios'
  },
  { 
      id: '2', 
      type: InvoiceType.EXPENSE, 
      number: 'R-24-001', 
      supplierNumber: 'FACT-99',
      date: '2024-01-20', 
      registrationDate: '2024-01-21',
      concept: 'Licencia Software Legal', 
      nif: 'B99999999', 
      entityName: 'LegalSoft S.L.', 
      fiscalAddress: 'Av. Tecnológica 22, Barcelona', 
      baseAmount: 50, 
      ivaRate: 21, 
      ivaAmount: 10.5, 
      irpfRate: 0, 
      irpfAmount: 0, 
      totalAmount: 60.5, 
      deductible: true, 
      category: 'Software',
      irpfExpenseType: 'Otros servicios exteriores',
      ivaExpenseType: 'Operaciones Interiores Corrientes'
  },
];

function App() {
  const [view, setView] = useState<'dashboard' | 'invoices' | 'taxes' | 'contacts' | 'profile'>('dashboard');
  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem('invoices');
    return saved ? JSON.parse(saved) : INITIAL_INVOICES;
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('invoices', JSON.stringify(invoices));
  }, [invoices]);

  const handleAskAi = (prompt: string) => {
    setAiPrompt(prompt);
    setIsChatOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 hidden md:flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Scale className="h-6 w-6 text-indigo-400" />
            AbogadoGestor
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${view === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <LayoutDashboard className="h-5 w-5" /> Dashboard
          </button>
          <button 
            onClick={() => setView('invoices')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${view === 'invoices' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Receipt className="h-5 w-5" /> Facturación
          </button>
          <button 
            onClick={() => setView('taxes')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${view === 'taxes' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Scale className="h-5 w-5" /> Modelos Fiscales
          </button>
          <button 
            onClick={() => setView('contacts')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${view === 'contacts' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Users className="h-5 w-5" /> Agenda (Clientes/Prov.)
          </button>
          <div className="pt-4 mt-4 border-t border-slate-800">
             <button 
              onClick={() => setView('profile')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${view === 'profile' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
            >
              <UserCog className="h-5 w-5" /> Datos del Profesional
            </button>
          </div>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-3 rounded-lg shadow-lg hover:from-indigo-700 hover:to-violet-700 transition flex items-center justify-center gap-2"
          >
            <MessageSquare className="h-5 w-5" /> Asesor IA
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-8">
        <div className="md:hidden flex items-center justify-between mb-6">
           <h1 className="text-xl font-bold text-slate-900">AbogadoGestor</h1>
           <button onClick={() => {}} className="p-2 bg-white rounded shadow text-slate-600">
             <Menu className="h-6 w-6" />
           </button>
        </div>

        <div className="max-w-7xl mx-auto">
          {view === 'dashboard' && <Dashboard invoices={invoices} />}
          {view === 'invoices' && <InvoiceManager invoices={invoices} setInvoices={setInvoices} />}
          {view === 'taxes' && <TaxModels invoices={invoices} onAskAi={handleAskAi} />}
          {view === 'contacts' && <ContactsManager />}
          {view === 'profile' && <ProfessionalProfile />}
        </div>
      </main>

      {/* Floating Chat Button for Mobile */}
      <button 
        onClick={() => setIsChatOpen(true)}
        className="md:hidden fixed bottom-6 right-6 p-4 bg-indigo-600 text-white rounded-full shadow-xl hover:bg-indigo-700 z-40"
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      {/* Chat Component */}
      <ChatBot 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
        externalPrompt={aiPrompt}
        onClearExternalPrompt={() => setAiPrompt('')}
      />
    </div>
  );
}

export default App;
