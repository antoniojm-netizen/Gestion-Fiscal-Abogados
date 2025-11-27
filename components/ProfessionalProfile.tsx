
import React, { useState, useEffect } from 'react';
import { ProfessionalProfile as ProfileType } from '../types';
import { UserCog, Save, Edit2, MapPin, Phone, Mail, Globe, Building2, Briefcase, FileText, CreditCard } from 'lucide-react';
import { Button } from './Button';

export const ProfessionalProfile: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<ProfileType>(() => {
    const saved = localStorage.getItem('professionalProfile');
    return saved ? JSON.parse(saved) : {
      name: '',
      nif: '',
      address: '',
      city: '',
      zipCode: '',
      province: '',
      barAssociation: '',
      collegiateNumber: '',
      phone: '',
      email: '',
      website: '',
      iban: ''
    };
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('professionalProfile', JSON.stringify(profile));
    setIsEditing(false);
    alert('Datos profesionales guardados correctamente.');
  };

  return (
    <div className="space-y-6">
       <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <UserCog className="h-6 w-6 text-indigo-600" />
            Datos del Profesional
          </h2>
          <p className="text-sm text-slate-500">Información del titular del despacho para facturación y modelos.</p>
        </div>
        <div>
          {!isEditing ? (
             <Button onClick={() => setIsEditing(true)}>
                <Edit2 className="h-4 w-4" /> Editar Datos
             </Button>
          ) : (
             <Button onClick={() => setIsEditing(false)} variant="secondary">
                Cancelar
             </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isEditing ? (
          <form onSubmit={handleSave} className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Identificación</h3>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre y Apellidos / Razón Social</label>
                    <input
                        type="text"
                        name="name"
                        value={profile.name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">NIF / CIF</label>
                    <input
                        type="text"
                        name="nif"
                        value={profile.nif}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        required
                    />
                </div>

                <div className="md:col-span-2 mt-2">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Datos Colegiales</h3>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Colegio Profesional</label>
                    <input
                        type="text"
                        name="barAssociation"
                        value={profile.barAssociation}
                        onChange={handleInputChange}
                        placeholder="Ej: ICAM, REAF..."
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Número de Colegiado</label>
                    <input
                        type="text"
                        name="collegiateNumber"
                        value={profile.collegiateNumber}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </div>

                <div className="md:col-span-2 mt-2">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Dirección Fiscal y Contacto</h3>
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Profesional</label>
                    <input
                        type="text"
                        name="address"
                        value={profile.address}
                        onChange={handleInputChange}
                        placeholder="Calle, número, piso..."
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Localidad</label>
                    <input
                        type="text"
                        name="city"
                        value={profile.city}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Código Postal</label>
                        <input
                            type="text"
                            name="zipCode"
                            value={profile.zipCode}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Provincia</label>
                        <input
                            type="text"
                            name="province"
                            value={profile.province}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                    <input
                        type="text"
                        name="phone"
                        value={profile.phone}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                        type="email"
                        name="email"
                        value={profile.email}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </div>
                
                 <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Página Web</label>
                    <input
                        type="text"
                        name="website"
                        value={profile.website}
                        onChange={handleInputChange}
                        placeholder="https://www.tudespacho.com"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                </div>
                
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta Bancaria (IBAN) - Para Facturas</label>
                    <input
                        type="text"
                        name="iban"
                        value={profile.iban || ''}
                        onChange={handleInputChange}
                        placeholder="ES00 0000 0000 0000 0000 0000"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                    />
                </div>

            </div>
            <div className="flex justify-end pt-6 border-t border-slate-100">
                <Button type="submit" className="w-full md:w-auto">
                    <Save className="h-5 w-5" /> Guardar Datos
                </Button>
            </div>
          </form>
        ) : (
          <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                      <div className="flex items-start gap-4">
                          <div className="p-3 bg-indigo-50 rounded-lg">
                              <Building2 className="h-6 w-6 text-indigo-600" />
                          </div>
                          <div>
                              <h3 className="text-lg font-bold text-slate-800">{profile.name || 'Sin nombre definido'}</h3>
                              <p className="text-slate-500 font-mono text-sm">{profile.nif || 'NIF no indicado'}</p>
                          </div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-slate-100">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Datos de Colegiación</h4>
                          <div className="flex items-center gap-3 text-slate-700">
                                <Briefcase className="h-5 w-5 text-slate-400" />
                                <div>
                                    <span className="block text-sm font-semibold">Colegio: {profile.barAssociation || '-'}</span>
                                    <span className="block text-xs text-slate-500">Nº Colegiado: {profile.collegiateNumber || '-'}</span>
                                </div>
                          </div>
                      </div>
                  </div>

                  <div className="space-y-6 md:border-l md:border-slate-100 md:pl-8">
                       <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Ubicación</h4>
                          <div className="flex items-start gap-3 text-slate-700">
                                <MapPin className="h-5 w-5 text-slate-400 mt-0.5" />
                                <div className="text-sm">
                                    <p>{profile.address || 'Dirección no indicada'}</p>
                                    <p>{profile.zipCode} {profile.city} {profile.province && `(${profile.province})`}</p>
                                </div>
                          </div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-slate-100">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Contacto</h4>
                          <div className="grid grid-cols-1 gap-3">
                              <div className="flex items-center gap-3 text-slate-700">
                                  <Phone className="h-5 w-5 text-slate-400" />
                                  <span className="text-sm">{profile.phone || '-'}</span>
                              </div>
                              <div className="flex items-center gap-3 text-slate-700">
                                  <Mail className="h-5 w-5 text-slate-400" />
                                  <span className="text-sm">{profile.email || '-'}</span>
                              </div>
                               <div className="flex items-center gap-3 text-slate-700">
                                  <Globe className="h-5 w-5 text-slate-400" />
                                  <span className="text-sm">{profile.website || '-'}</span>
                              </div>
                          </div>
                      </div>

                      {profile.iban && (
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Facturación</h4>
                            <div className="flex items-center gap-3 text-slate-700">
                                  <CreditCard className="h-5 w-5 text-slate-400" />
                                  <div>
                                     <span className="text-xs text-slate-500 block">IBAN</span>
                                     <span className="font-mono text-sm">{profile.iban}</span>
                                  </div>
                              </div>
                        </div>
                      )}
                  </div>
              </div>
          </div>
        )}
      </div>
    </div>
  );
};
