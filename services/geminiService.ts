import { GoogleGenAI, Type } from "@google/genai";
import { Invoice, InvoiceType } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key not found");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Analyze expense deductibility for a Spanish lawyer
export const analyzeExpenseDeductibility = async (concept: string, amount: number) => {
  const ai = getAiClient();
  if (!ai) throw new Error("AI Client not initialized");

  const prompt = `
    Actúa como un asesor fiscal experto en España para abogados autónomos (Estimación Directa Simplificada).
    Analiza si el siguiente gasto es deducible.
    Concepto: "${concept}"
    Importe: ${amount}€

    Responde estrictamente en formato JSON con la siguiente estructura:
    {
      "deductible": boolean,
      "reason": string (breve explicación),
      "suggestedIrpfExpenseType": string (Elige uno EXACTO de esta lista: "Consumos de explotación", "Sueldos y salarios", "Seguridad Social", "Otros gastos de personal", "Arrendamientos y cánones", "Reparaciones y conservación", "Servicios de profesionales independientes", "Suministros", "Otros servicios exteriores", "Tributos fiscalmente deducibles", "Gastos financieros", "Amortizaciones", "Otros conceptos"),
      "suggestedIvaExpenseType": string (Elige uno EXACTO de esta lista: "Operaciones Interiores Corrientes", "Bienes de Inversión", "Importaciones", "Adquisiciones Intracomunitarias", "Inversión del Sujeto Pasivo"),
      "suggestedIvaRate": number,
      "suggestedIrpfRate": number
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            deductible: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
            suggestedIrpfExpenseType: { type: Type.STRING },
            suggestedIvaExpenseType: { type: Type.STRING },
            suggestedIvaRate: { type: Type.NUMBER },
            suggestedIrpfRate: { type: Type.NUMBER },
          },
        },
      },
    });
    
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error analyzing expense:", error);
    return {
      deductible: false,
      reason: "Error en el análisis IA",
      suggestedIrpfExpenseType: "Otros servicios exteriores",
      suggestedIvaExpenseType: "Operaciones Interiores Corrientes",
      suggestedIvaRate: 21,
      suggestedIrpfRate: 0
    };
  }
};

// Extract data from Invoice PDF/Image
export const extractInvoiceData = async (file: File) => {
  const ai = getAiClient();
  if (!ai) throw new Error("AI Client not initialized");

  // Convert file to base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });

  const prompt = `
    Analiza esta factura/ticket y extrae los datos para contabilidad (España) de un abogado autónomo.

    IMPORTANTE - DATOS DEL EMISOR (USUARIO) A IGNORAR:
    El usuario del sistema es "Antonio José Muñoz González" (Abogado, Colegiado 4337), con NIF "25143721Y" y domicilio en "Avenida de San José 173 cuarto, Zaragoza".
    
    INSTRUCCIÓN CRÍTICA:
    NO uses los datos anteriores para los campos 'entityName', 'nif' o 'fiscalAddress'. 
    Esos campos deben corresponder SIEMPRE a la OTRA PARTE (el Cliente si es factura emitida/ingreso, o el Proveedor si es factura recibida/gasto).
    Si ves "Antonio José Muñoz González" como emisor, extrae los datos del receptor (Cliente).
    
    Estructura JSON requerida:
    {
      "number": "string",
      "date": "YYYY-MM-DD",
      "entityName": "string (El Cliente o Proveedor, NUNCA Antonio José Muñoz González)",
      "nif": "string (El del Cliente o Proveedor)",
      "fiscalAddress": "string",
      "concept": "string",
      "baseAmount": number,
      "ivaRate": number,
      "irpfRate": number,
      "totalAmount": number,
      "deductible": boolean,
      "inferredIrpfExpenseType": "string (Solo si es gasto. Ej: Suministros, Arrendamientos, Servicios profesionales, etc.)",
      "inferredIvaExpenseType": "string (Solo si es gasto. Ej: Operaciones Interiores Corrientes, Bienes de Inversión)",
      "suggestedContext": "string (Values: MEAL, TRAVEL, OTHER)"
    }
    
    Instrucciones adicionales:
    1. Deduce impuestos (IVA/IRPF) si faltan mediante cálculo matemático inverso desde el Total.
       Ejemplo: Si Total = 121 y parece 21% IVA, Base = 100.
    2. Si es ticket de gasolina/restaurante, IRPF suele ser 0.
    3. Si es factura de otro abogado/procurador, IRPF suele ser 15 (Retención).
    4. Clasifica "inferredIrpfExpenseType" e "inferredIvaExpenseType" según la naturaleza del gasto.
    5. Determina "deductible" (true/false). Si parece un gasto personal obvio (juguetes, cine), false.
    6. Identifica el contexto ("suggestedContext"): 
       - Si es restaurante/comida -> "MEAL". 
       - Si es transporte/hotel/parking -> "TRAVEL". 
       - Resto -> "OTHER".
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: file.type, data: base64Data } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error extracting PDF data:", error);
    throw error;
  }
};

// Audit invoices for errors or anomalies
export const auditInvoices = async (invoices: Invoice[]) => {
  const ai = getAiClient();
  if (!ai) throw new Error("AI Client not initialized");

  const invoicesData = JSON.stringify(invoices.map(inv => ({
    id: inv.id,
    type: inv.type,
    number: inv.number,
    date: inv.date,
    total: inv.totalAmount,
    nif: inv.nif,
    fiscalAddress: inv.fiscalAddress
  })));

  const prompt = `
    Analiza estas facturas de abogado autónomo.
    Detecta: Duplicados, saltos de numeración (Ingresos), inconsistencias.
    Datos: ${invoicesData}
    Devuelve JSON con "alerts": [{ invoiceId, severity (HIGH/MEDIUM/LOW), message }].
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            alerts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  invoiceId: { type: Type.STRING },
                  severity: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
                  message: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Audit error:", error);
    return { alerts: [] };
  }
};

export const sendChatMessage = async (history: {role: string, parts: {text: string}[]}[], message: string) => {
  const ai = getAiClient();
  if (!ai) throw new Error("AI Client not initialized");

  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    history: history,
    config: {
      systemInstruction: `Eres asesor experto en fiscalidad española para abogados. Ayuda con IVA, IRPF y contabilidad.`
    }
  });

  const result = await chat.sendMessage({ message });
  return result.text;
};