/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  FileText,
  X,
  FileWarning,
  Files
} from 'lucide-react';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ExcelData {
  headers: string[];
  rows: any[];
}

const PROVIDERS = [
  { name: "AB LOGISTICA LIMITADA", code: "77602992" },
  { name: "DANIEL JEREMIAS BENAVIDES JARA", code: "7307808" },
  { name: "ROCO Y CIA LTDA.", code: "7888993" },
  { name: "SOFOFA", code: "70024300" },
  { name: "CIA.SEGUROS GENERALES CONTINENTAL S.A", code: "76039758" },
  { name: "BON VOYAGE LOGISTICS CHILE SPA", code: "76079749" },
  { name: "ASES. E INV. HOWDEN-PATAGONIA S.A.", code: "76200018" },
  { name: "LOGISTICA Y TRANSPORTE BULL LIMITADA", code: "76285141" },
  { name: "ASESORES EN COMERCIO EXTERIOR SPA", code: "76310935" },
  { name: "ROBERTO VASQUEZ SERV. GRUAS EIRL", code: "76442059" },
  { name: "TRANSPORTE NADIA ELVIRA BECERRA", code: "76777058" },
  { name: "SOC.DE TRANSP.CARRASCO MADARIAGA LTDA", code: "76939814" },
  { name: "LARRANAGA LOGISTICA SPA", code: "77275056" },
  { name: "SERVICIO DE TRANSPORTES Y CARGUIOS LTDA", code: "77939480" },
  { name: "DHL EXPRESS (CHILE) LIMITADA", code: "86966100" },
  { name: "AEROSAN S.A", code: "94058000" },
  { name: "FAST AIR ALMACENES DE CARGA S.A.", code: "96631520" },
  { name: "DEPOCARGO LTDA.", code: "96888200" },
  { name: "SEGUROS GENERALES SURAMERICANA S.A.", code: "99017000" },
  { name: "CHUBB SEGUROS CHILE S.A", code: "99225000" },
  { name: "SAN ANTONIO TERMINAL INTERNACIONAL S.A.", code: "10091" },
  { name: "DP WORLD SAN ANTONIO S.A.", code: "10117" }
];

const BANKS = [
  { name: "BANCO SANTANDER 1", code: "111201" },
  { name: "BANCO SANTANDER 2", code: "111202" },
  { name: "BANCO CHILE - LJORQ.", code: "111203" },
  { name: "BANCO CHILE - GERENCIA", code: "111204" },
  { name: "BANCO CHILE - CLAYANA", code: "111205" },
  { name: "BANCO DOLAR SANTANDER", code: "111206" },
  { name: "BCO. CHILE - SAN ANTONIO", code: "111207" },
  { name: "BCO. CHILE - VALPARAISO", code: "111208" },
  { name: "BCO. CHILE - LOS ANDES", code: "111209" },
  { name: "BCO. CHILE - TCHNO", code: "111210" },
  { name: "BCO. CHILE - AEROPUERTO", code: "111211" },
  { name: "BCO. SCOTIABANK 1", code: "111212" },
  { name: "BCO. SCOTIABANK 2", code: "111213" }
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ExcelData | null>(null);
  const [transformedData, setTransformedData] = useState<ExcelData | null>(null);
  const [invalidAmountCoords, setInvalidAmountCoords] = useState<string[]>([]);
  const [showCustomAlert, setShowCustomAlert] = useState(false);
  const [showPdfTypeModal, setShowPdfTypeModal] = useState(false);
  const [pendingPdfFiles, setPendingPdfFiles] = useState<{textFiles: File[], scannedFiles: File[]}>({textFiles: [], scannedFiles: []});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(true);
  const [configConfirmed, setConfigConfirmed] = useState(false);
  const isCancelled = useRef(false);
  
  // Format Configuration State
  const [config, setConfig] = useState({
    cuentaMayorRows: "", // Force selection
    cuentaMayorSummary: "", // Force selection
    codAnalisis: "", // Force selection
    centroCostos: "70024300",
    tipoDoc: "DOCOM",
    codNegocio: "CDNN"
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    const pdfFiles = fileList.filter(f => f.type === 'application/pdf');
    const excelFiles = fileList.filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));

    if (pdfFiles.length > 0) {
      processPdfFiles(pdfFiles);
    } else if (excelFiles.length > 0) {
      processFile(excelFiles[0]);
    }
  };

  const processPdfFiles = async (files: File[]) => {
    setIsProcessing(true);
    setProcessingProgress(10);
    setError(null);
    setFile(files[0]);
    
    const textFiles: File[] = [];
    const scannedFiles: File[] = [];

    try {
      const totalFiles = files.length;
      
      // Process files in parallel for classification
      const classificationResults = await Promise.all(files.map(async (file, index) => {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          let hasText = false;

          // Optimization: Check only first 3 pages for classification
          const pagesToCheck = Math.min(pdf.numPages, 3);
          for (let i = 1; i <= pagesToCheck; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const hasActualText = textContent.items.some((item: any) => 
              item.str && item.str.trim().length > 0
            );

            if (hasActualText) {
              hasText = true;
              break;
            }
          }
          
          return { file, hasText };
        } catch (err) {
          console.error(`Error al clasificar el PDF ${file.name}:`, err);
          return { file, hasText: false };
        }
      }));

      classificationResults.forEach(res => {
        if (res.hasText) textFiles.push(res.file);
        else scannedFiles.push(res.file);
      });

      setProcessingProgress(40);

      if (textFiles.length > 0 && scannedFiles.length > 0) {
        setPendingPdfFiles({ textFiles, scannedFiles });
        setShowPdfTypeModal(true);
      } else if (textFiles.length === 0 && scannedFiles.length > 0) {
        setPendingPdfFiles({ textFiles: [], scannedFiles });
        setShowPdfTypeModal(true);
      } else if (textFiles.length > 0) {
        await extractDataFromPdfs(textFiles);
      } else {
        setError('No se pudo extraer información de los archivos PDF.');
      }
    } catch (err) {
      setError('Error crítico al procesar los archivos PDF.');
      console.error(err);
    } finally {
      if (!showPdfTypeModal && textFiles.length === 0) {
        setIsProcessing(false);
        setProcessingProgress(0);
      }
    }
  };

  const finalizeData = (rows: any[], firstFile: File) => {
    setProcessingProgress(95);
    const sourceData = {
      headers: ['DOCUMENTO', 'MONTO', 'RUT', 'FECHA', 'DESPACHO', 'GLOSA'],
      rows: rows
    };
    setData(sourceData);
    setFile(firstFile);
    
    setTimeout(() => {
      transformDataWithCustomMapping({
        doc: 0,
        monto: 1,
        rut: 2,
        fecha: 3,
        despacho: 4
      }, sourceData);
    }, 100);
  };

  const processAllPdfsMixed = async (textFiles: File[], scannedFiles: File[]) => {
    setIsAiProcessing(true);
    setProcessingProgress(5);
    setError(null);
    isCancelled.current = false;
    setShowPdfTypeModal(false);
    
    let allRows: any[] = [];
    
    try {
      // 1. Process Text Files
      if (textFiles.length > 0) {
        const textRows = await extractDataFromPdfs(textFiles, true);
        if (textRows) allRows = [...allRows, ...textRows];
      }
      
      if (isCancelled.current) return;
      
      // 2. Process Scanned Files
      if (scannedFiles.length > 0) {
        const scannedRows = await processScannedPdfsWithAI(scannedFiles, true);
        if (scannedRows) allRows = [...allRows, ...scannedRows];
      }
      
      if (allRows.length > 0) {
        finalizeData(allRows, textFiles[0] || scannedFiles[0]);
      } else {
        setError('No se encontraron datos válidos en los PDFs.');
      }
    } catch (err) {
      console.error("Mixed Processing Error:", err);
      setError("Error al procesar la mezcla de archivos.");
    } finally {
      setIsAiProcessing(false);
      setIsProcessing(false);
    }
  };

  const cleanRutString = (s: string) => s.replace(/\s+/g, '').replace(/\./g, '').toUpperCase();

  const processScannedPdfsWithAI = async (files: File[], returnRows = false) => {
    setIsAiProcessing(true);
    setProcessingProgress(10);
    setError(null);
    isCancelled.current = false;
    setShowPdfTypeModal(false);
    const rows: any[] = [];

    const callAiWithRetry = async (ai: any, params: any, maxRetries = 3) => {
      let lastError: any;
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await ai.models.generateContent(params);
        } catch (err: any) {
          lastError = err;
          // If it's a rate limit error (429), wait and retry
          if (err.message?.includes('429') || err.status === 429 || JSON.stringify(err).includes('429')) {
            const waitTime = Math.pow(2, i) * 2000 + Math.random() * 1000;
            console.warn(`Rate limit hit, retrying in ${Math.round(waitTime)}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw err;
        }
      }
      throw lastError;
    };

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const totalFiles = files.length;
      
      // Process files sequentially to avoid rate limits
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        if (isCancelled.current) break;
        const file = files[fileIndex];
        
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const numPages = Math.min(pdf.numPages, 5); // Reduced to 5 pages per file for safety

          // Process pages sequentially
          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            if (isCancelled.current) break;
            
            try {
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 3.0 });
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              if (context) {
                await page.render({ canvasContext: context, viewport }).promise;
                const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

                const response = await callAiWithRetry(ai, {
                  model: "gemini-3.1-pro-preview",
                  contents: [
                    {
                      parts: [
                        { text: "Eres un experto en Facturas Electrónicas Chilenas (formato SII). Analiza esta imagen y extrae los datos en JSON:\n\n1. numero_documento: Es el FOLIO. Se ubica en el recuadro superior derecho. Busca el número que acompaña a 'N°.:'. Ejemplo: '1292070'.\n2. rut_consignatario: Es el RUT del CLIENTE (Receptor). Se ubica en la sección media, usualmente en un recuadro a la derecha de 'Señor(es)'. Debe tener el formato 12.345.678-9. IMPORTANTE: Ignora números de teléfono (que empiezan por 56-) y el RUT del emisor (que está en el encabezado superior).\n3. monto_total: Se ubica en el recuadro de totales abajo a la derecha. Busca 'MONTO TOTAL'. Extrae solo números.\n4. fecha_emision: Fecha en formato DD-MM-YYYY.\n5. numero_despacho: Busca específicamente un número de 6 dígitos. En las facturas de STI (San Antonio Terminal Internacional), este número suele estar escrito a mano o impreso de forma aislada en la zona central del documento, justo encima de los totales y debajo de la descripción de los servicios. Es un número suelto de 6 dígitos (ej: 876056). NO lo confundas con el folio (7 dígitos) ni con el RUT.\n\nResponde estrictamente en JSON." },
                        { inlineData: { mimeType: "image/jpeg", data: base64Image } }
                      ]
                    }
                  ],
                  config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                        numero_documento: { type: Type.STRING },
                        monto_total: { type: Type.STRING },
                        rut_consignatario: { type: Type.STRING },
                        fecha_emision: { type: Type.STRING },
                        numero_despacho: { type: Type.STRING }
                      }
                    }
                  }
                });

                const result = JSON.parse(response.text || '{}');
                
                const cleanAmount = (s: string) => {
                  if (!s) return 0;
                  if (s.includes('.') && s.includes(',')) {
                    return Math.round(Number(s.replace(/\./g, '').replace(',', '.'))) || 0;
                  }
                  if (s.includes(',')) {
                    return Math.round(Number(s.replace(',', '.'))) || 0;
                  }
                  if (s.includes('.') && s.split('.').pop()?.length === 3) {
                    return Math.round(Number(s.replace(/\./g, ''))) || 0;
                  }
                  return Math.round(Number(s.replace(/[^\d.]/g, ''))) || 0;
                };

                if (result.numero_documento || result.rut_consignatario || result.monto_total) {
                  const row = new Array(6).fill('');
                  row[0] = result.numero_documento || '';
                  row[1] = cleanAmount(result.monto_total);
                  row[2] = result.rut_consignatario ? cleanRutString(result.rut_consignatario) : '';
                  row[3] = result.fecha_emision || '';
                  row[4] = result.numero_despacho || '';
                  row[5] = `AI OCR (Pág ${pageNum}): ${file.name}`;
                  rows.push(row);
                }
                
                // Small delay between pages to be gentle with the API
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (pageErr) {
              console.error(`Error processing page ${pageNum} of ${file.name}:`, pageErr);
            }
          }
          
          // Update progress
          setProcessingProgress(prev => Math.min(90, prev + (80 / totalFiles)));
        } catch (fileErr) {
          console.error(`Error processing file ${file.name}:`, fileErr);
        }
      }

      if (returnRows) return rows;

      if (rows.length > 0) {
        finalizeData(rows, files[0]);
      } else {
        setError('No se pudo extraer información mediante IA.');
      }
    } catch (err) {
      console.error("AI Processing Error:", err);
      setError('Error al procesar con IA. Verifique su conexión y el archivo.');
    } finally {
      setIsAiProcessing(false);
      setProcessingProgress(0);
    }
  };

  const extractDataFromPdfs = async (files: File[], returnRows = false) => {
    setIsProcessing(true);
    setProcessingProgress(40);
    setError(null);
    isCancelled.current = false;
    setShowPdfTypeModal(false);
    const rows: any[] = [];
    const totalFiles = files.length;

    const monthsMap: { [key: string]: string } = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06',
      'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };

    try {
      // Process files in parallel
      const fileResults = await Promise.all(files.map(async (file, index) => {
        if (isCancelled.current) return [];
        const fileRows: any[] = [];
        
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const numPages = Math.min(pdf.numPages, 50); // Limit pages for text extraction

          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            if (isCancelled.current) break;
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ') + '\n';

            // 1. Extract RUT
            let rut = '';
            const rutRegex = /(\d{1,2}(?:\s*\.?\s*\d{3}){1,2}\s*-\s*[\dkK]|\d{6,8}\s*-\s*[\dkK])/gi;
            const clientAreaMatch = pageText.match(/(?:SEÑOR\(ES\)|GIRO|CONSIGNATARIO|CLIENTE|DESTINATARIO|R\.?U\.?T\.?)\s*[:.]?\s*[\s\S]{0,100}?(\d{1,2}(?:\s*\.?\s*\d{3}){0,2}\s*-\s*[\dkK])/i);
            if (clientAreaMatch && !clientAreaMatch[1].startsWith('56-')) {
              rut = cleanRutString(clientAreaMatch[1]);
            } else {
              const allRuts = (pageText.match(rutRegex) || []).filter(r => !r.startsWith('56-'));
              if (allRuts.length > 1) {
                rut = cleanRutString(allRuts[1]);
              } else if (allRuts.length === 1) {
                rut = cleanRutString(allRuts[0]);
              }
            }

            // 2. Extract Date
            let fecha = '';
            const verbalFechaMatch = pageText.match(/(?:FECHA\s+EMISI[ÓO]N|FECHA)[\s:]*\s*(\d{1,2})\s+de\s+([a-zA-Z]+)\s+(?:de|del)\s+(\d{4})/i);
            if (verbalFechaMatch) {
              const day = verbalFechaMatch[1].trim().padStart(2, '0');
              const monthName = verbalFechaMatch[2].trim().toLowerCase();
              const year = verbalFechaMatch[3].trim();
              const month = monthsMap[monthName] || '01';
              fecha = `${day}-${month}-${year}`;
            } else {
              const standardFechaMatch = pageText.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
              if (standardFechaMatch) {
                fecha = standardFechaMatch[1].trim();
              }
            }

            // 3. Extract Amount
            const montoMatch = pageText.match(/(?:TOTAL|MONTO|VALOR|NETO|PAGAR|TOTAL A PAGAR|SALDO)\s*:?\s*\$?\s*([\d.,]+)/i);
            
            // 4. Extract Document Number
            const docMatch = pageText.match(/(?:FACTURA|BOLETA|N[º°º]\.?\s*[:.]\s*[:.]?|FOLIO\s*[:.]?)\s*(\d{5,})/i) || 
                             pageText.match(/(?:FACTURA|BOLETA|N[º°º]\.?\s*:?|NUMERO|DOCUMENTO|FOLIO)\s*(\d{5,})/i);
            
            // 5. Extract Despacho
            let despacho = '';
            const labeledDespachoMatch = pageText.match(/(?:DESPACHO|NRO\.?\s*DESPACHO|N[°º]\.?\s*DESPACHO|I-)\s*[:.]?\s*(\d{6})\b/i);
            if (labeledDespachoMatch) {
              despacho = labeledDespachoMatch[1];
            } else {
              const allSixDigits = pageText.match(/\b\d{6}\b/g) || [];
              despacho = allSixDigits.find(d => !pageText.includes(`${d}-`)) || ''; 
            }

            if (docMatch || rut || montoMatch) {
              const row = new Array(6).fill(''); 
              row[0] = docMatch ? docMatch[1] : '';
              
              let amount = 0;
              if (montoMatch) {
                const rawAmount = montoMatch[1].replace(/\./g, '').replace(',', '.');
                amount = Math.round(Number(rawAmount));
              }
              row[1] = amount;
              row[2] = rut;
              row[3] = fecha;
              row[4] = despacho;
              row[5] = `PDF (Pág ${pageNum}): ${file.name}`;
              fileRows.push(row);
            }
          }
          
          setProcessingProgress(prev => Math.min(90, prev + (50 / totalFiles)));
        } catch (err) {
          console.error(`Error al extraer datos de ${file.name}:`, err);
        }
        return fileRows;
      }));

      fileResults.forEach(res => rows.push(...res));

      if (returnRows) return rows;

      if (rows.length === 0) {
        setError('No se encontraron datos válidos en los PDFs.');
        setIsProcessing(false);
        setProcessingProgress(0);
        return;
      }

      finalizeData(rows, files[0]);

    } catch (err) {
      setError('Error al extraer datos de los PDFs.');
      console.error(err);
    } finally {
      if (!returnRows) {
        setIsProcessing(false);
        setProcessingProgress(0);
      }
    }
  };

  const transformDataWithCustomMapping = (mapping: any, sourceData: ExcelData) => {
    setIsProcessing(true);
    setProcessingProgress(98);
    const targetHeaders = [
      'CUENTA MAYOR', '', 'CENTRO COSTOS', '', 'COD. ANALISIS', '', '', 
      'N.º DOCUMENTO', 'DEBE', 'HABER', 'RUT CLTE. (CON DV)', '', 
      'DESPACHO', 'COD. ANALISIS SERV. PRESTADO', 'GLOSA', 
      'FECHA_DOCU', 'ID_TIPODOCU', 'CONCEPTO_DESEMB'
    ];

    try {
      let totalSum = 0;
      const coords: string[] = [];
      
      const newRows = sourceData.rows
        .map((row, originalIdx) => ({ row, originalIdx }))
        .filter(({ row }) => {
          const docVal = mapping.doc !== -1 ? String(row[mapping.doc] || '').trim() : '';
          const montoVal = mapping.monto !== -1 ? String(row[mapping.monto] || '').trim() : '';
          return docVal !== '' || montoVal !== '';
        })
        .map(({ row, originalIdx }) => {
          const newRow = new Array(targetHeaders.length).fill('');
          newRow[0] = config.cuentaMayorRows;
          newRow[2] = 0;
          newRow[4] = config.codAnalisis;
          
          let docNum = '';
          if (mapping.doc !== -1) {
            docNum = String(row[mapping.doc] || '');
            newRow[7] = docNum;
          }
          
          if (mapping.monto !== -1) {
            const val = row[mapping.monto];
            const rawVal = String(val || '').replace(/[^0-9.-]+/g, "");
            const amount = typeof val === 'number' ? Math.round(val) : Math.round(Number(rawVal));
            
            if (isNaN(amount) || amount === 0) {
              const colLetter = XLSX.utils.encode_col(mapping.monto);
              const rowNum = originalIdx + 2;
              coords.push(`${colLetter}${rowNum}`);
              newRow[8] = 0;
            } else {
              newRow[8] = amount;
            }
            totalSum += newRow[8];
          }
          
          newRow[9] = 0;
          
          if (mapping.rut !== -1) {
            const rutVal = String(row[mapping.rut] || '');
            newRow[10] = rutVal.replace(/\./g, '').toUpperCase();
          }
          
          if (mapping.despacho !== -1) {
            newRow[12] = cleanValue(row[mapping.despacho]);
          }
          
          newRow[13] = config.centroCostos;
          const providerName = PROVIDERS.find(p => p.code === config.codAnalisis)?.name || "SOFOFA";
          newRow[14] = `${providerName} - ${docNum}`;
          
          if (mapping.fecha !== -1) {
            const fechaVal = row[mapping.fecha];
            let formattedDate = '';
            const formatDate = (d: Date) => {
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const year = d.getFullYear();
              return `${day}-${month}-${year}`;
            };

            if (fechaVal instanceof Date && !isNaN(fechaVal.getTime())) {
              formattedDate = formatDate(fechaVal);
            } else if (typeof fechaVal === 'string' && fechaVal.trim() !== '') {
              const parsedDate = new Date(fechaVal);
              if (!isNaN(parsedDate.getTime())) {
                formattedDate = formatDate(parsedDate);
              } else {
                formattedDate = fechaVal;
              }
            } else {
              formattedDate = String(fechaVal || '');
            }
            newRow[15] = `'${formattedDate}`;
          }
          
          newRow[16] = config.tipoDoc;
          newRow[17] = config.codNegocio;
          return newRow;
        });

      const summaryRow = new Array(targetHeaders.length).fill('');
      const providerName = PROVIDERS.find(p => p.code === config.codAnalisis)?.name || "SOFOFA";
      summaryRow[0] = config.cuentaMayorSummary;
      summaryRow[2] = 0;
      summaryRow[4] = 0;
      summaryRow[7] = 0;
      summaryRow[8] = 0;
      summaryRow[9] = totalSum;
      summaryRow[14] = providerName;
      newRows.push(summaryRow);

      setInvalidAmountCoords(coords);
      setTransformedData({
        headers: targetHeaders,
        rows: newRows
      });
      setIsProcessing(false);
      setProcessingProgress(100);
      
      // Reset progress after a short delay
      setTimeout(() => setProcessingProgress(0), 500);

      if (coords.length > 0) {
        setShowCustomAlert(true);
      }
    } catch (err) {
      setError('Error durante la transformación de datos.');
      setIsProcessing(false);
    }
  };

  const processFile = (file: File) => {
    setError(null);
    setFile(file);
    setIsProcessing(true);
    setProcessingProgress(20);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        setProcessingProgress(50);
        const bstr = e.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        if (json.length > 0) {
          setProcessingProgress(80);
          setData({
            headers: json[0].map(h => String(h || '')),
            rows: json.slice(1)
          });
        }
        setProcessingProgress(100);
        setTimeout(() => {
          setIsProcessing(false);
          setProcessingProgress(0);
        }, 300);
      } catch (err) {
        setError('Error al leer el archivo Excel. Asegúrate de que sea un formato válido.');
        console.error(err);
        setIsProcessing(false);
        setProcessingProgress(0);
      }
    };
    reader.readAsBinaryString(file);
  };

  const cleanValue = (val: any) => {
    if (typeof val === 'number') {
      return Math.round(val);
    }
    if (typeof val === 'string') {
      // Limpiar RUT: quitar puntos de formatos como 12.345.678-9 y normalizar K
      if (/^\d{1,2}(\.\d{3}){2}-[\dkK]$/i.test(val)) {
        return val.replace(/\./g, '').toUpperCase();
      }
      // Quitar decimales si es un string numérico
      if (val.trim() !== '' && !isNaN(Number(val)) && val.includes('.')) {
        return Math.round(Number(val));
      }
    }
    return val;
  };

  const transformData = () => {
    if (!data) return;
    setIsProcessing(true);
    setProcessingProgress(10);
    
    setTimeout(() => {
      try {
        setProcessingProgress(30);
        const targetHeaders = [
          'CUENTA MAYOR', '', 'CENTRO COSTOS', '', 'COD. ANALISIS', '', '', 
          'N.º DOCUMENTO', 'DEBE', 'HABER', 'RUT CLTE. (CON DV)', '', 
          'DESPACHO', 'COD. ANALISIS SERV. PRESTADO', 'GLOSA', 
          'FECHA_DOCU', 'ID_TIPODOCU', 'CONCEPTO_DESEMB'
        ];

        const inputHeaders = data.headers.map(h => h.toUpperCase().trim());
        
        const findIdx = (keywords: string[]) => 
          inputHeaders.findIndex(h => keywords.some(k => h.includes(k)));

        const mapping = {
          doc: findIdx(['DOC', 'NUMERO', 'Nº', 'N.º', 'FACTURA']),
          monto: findIdx(['MONTO', 'VALOR', 'DEBE', 'CARGOS', 'TOTAL']),
          rut: findIdx(['RUT']),
          fecha: findIdx(['FECHA']),
          despacho: findIdx(['DESPACHO'])
        };

        let totalSum = 0;
        const coords: string[] = [];
        
        setProcessingProgress(60);
        const newRows = data.rows
          .map((row, originalIdx) => ({ row, originalIdx }))
          .filter(({ row }) => {
            // Sugerencia Punto 2: Ignorar filas vacías o sin datos críticos
            const docVal = mapping.doc !== -1 ? String(row[mapping.doc] || '').trim() : '';
            const montoVal = mapping.monto !== -1 ? String(row[mapping.monto] || '').trim() : '';
            return docVal !== '' || montoVal !== '';
          })
          .map(({ row, originalIdx }) => {
            const newRow = new Array(targetHeaders.length).fill('');
            
            // Col A (0): Cuenta Mayor Rows
            newRow[0] = config.cuentaMayorRows;
            // Col B (1): Blank
            // Col C (2): Always 0
            newRow[2] = 0;
            // Col D (3): Blank
            // Col E (4): Cod Analisis
            newRow[4] = config.codAnalisis;
            // Col F (5): Blank
            // Col G (6): Blank
            
            // Col H (7): Invoice/Document Number
            let docNum = '';
            if (mapping.doc !== -1) {
              docNum = String(row[mapping.doc] || '');
              newRow[7] = docNum;
            }
            
            // Col I (8): Amount (no thousands separator, no decimals)
            if (mapping.monto !== -1) {
              const val = row[mapping.monto];
              const rawVal = String(val || '').replace(/[^0-9.-]+/g, "");
              const amount = typeof val === 'number' ? Math.round(val) : Math.round(Number(rawVal));
              
              if (isNaN(amount) || amount === 0) {
                const colLetter = XLSX.utils.encode_col(mapping.monto);
                const rowNum = originalIdx + 2; // +1 por 0-index, +1 por el header
                coords.push(`${colLetter}${rowNum}`);
                newRow[8] = 0;
              } else {
                newRow[8] = amount;
              }
              totalSum += newRow[8];
            }
            
            // Col J (9): Always 0
            newRow[9] = 0;
            
            // Col K (10): RUT (no dots, uppercase K)
            if (mapping.rut !== -1) {
              const rutVal = String(row[mapping.rut] || '');
              newRow[10] = rutVal.replace(/\./g, '').toUpperCase();
            }
            
            // Col L (11): Blank
            
            // Col M (12): Despacho mapped from source
            if (mapping.despacho !== -1) {
              newRow[12] = cleanValue(row[mapping.despacho]);
            }
            
            // Col N (13): Centro Costos
            newRow[13] = config.centroCostos;
            
            // Col O (14): Provider Name - docNum
            const providerName = PROVIDERS.find(p => p.code === config.codAnalisis)?.name || "SOFOFA";
            newRow[14] = `${providerName} - ${docNum}`;
            
            // Col P (15): Fecha prefixed with ' and format DD-MM-YYYY
            if (mapping.fecha !== -1) {
              const fechaVal = row[mapping.fecha];
              let formattedDate = '';
              
              const formatDate = (d: Date) => {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return `${day}-${month}-${year}`;
              };

              if (fechaVal instanceof Date && !isNaN(fechaVal.getTime())) {
                formattedDate = formatDate(fechaVal);
              } else if (typeof fechaVal === 'string' && fechaVal.trim() !== '') {
                const parsedDate = new Date(fechaVal);
                if (!isNaN(parsedDate.getTime())) {
                  formattedDate = formatDate(parsedDate);
                } else {
                  formattedDate = fechaVal;
                }
              } else {
                formattedDate = String(fechaVal || '');
              }
              newRow[15] = `'${formattedDate}`;
            }
            
            // Col Q (16): Tipo Doc
            newRow[16] = config.tipoDoc;
            
            // Col R (17): Cod Negocio
            newRow[17] = config.codNegocio;

            return newRow;
          });

        setProcessingProgress(90);
        // Add summary row
        const summaryRow = new Array(targetHeaders.length).fill('');
        const providerName = PROVIDERS.find(p => p.code === config.codAnalisis)?.name || "SOFOFA";
        summaryRow[0] = config.cuentaMayorSummary; // Col A
        summaryRow[2] = 0;        // Col C (Number 0)
        summaryRow[4] = 0;        // Col E (Number 0)
        summaryRow[7] = 0;        // Col H (Number 0)
        summaryRow[8] = 0;        // Col I (Number 0)
        summaryRow[9] = totalSum; // Col J (Sum of Col I)
        summaryRow[14] = providerName; // Col O
        newRows.push(summaryRow);

        setInvalidAmountCoords(coords);
        setTransformedData({
          headers: targetHeaders,
          rows: newRows
        });
        setProcessingProgress(100);
        setTimeout(() => {
          setIsProcessing(false);
          setProcessingProgress(0);
        }, 300);

        if (coords.length > 0) {
          setShowCustomAlert(true);
        }
      } catch (err) {
        setError('Error durante la transformación de datos.');
        setIsProcessing(false);
        setProcessingProgress(0);
      }
    }, 1000);
  };

  const downloadExcel = () => {
    if (!transformedData) return;
    
    const worksheet = XLSX.utils.aoa_to_sheet([
      transformedData.headers,
      ...transformedData.rows
    ]);

    // Aplicar quotePrefix a la columna P (Fecha) para que el ' sea invisible pero esté presente al editar
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) { // +1 para saltar el encabezado
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: 15 }); // Columna P es índice 15
      const cell = worksheet[cellAddress];
      if (cell && cell.t === 's' && String(cell.v).startsWith("'")) {
        // En SheetJS, para que Excel oculte el ', el valor debe ser la fecha SIN el '
        // y la propiedad quotePrefix debe ser true.
        cell.v = String(cell.v).substring(1);
        cell.z = '@'; // Formato de texto
        // @ts-ignore - quotePrefix es soportado por Excel pero no siempre está en los tipos básicos
        cell.s = { ...cell.s, quotePrefix: true };
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transformado");
    
    XLSX.writeFile(workbook, `transformado_${new Date().getTime()}.xlsx`);
  };

  const reset = () => {
    setFile(null);
    setData(null);
    setTransformedData(null);
    setInvalidAmountCoords([]);
    setShowCustomAlert(false);
    setShowPdfTypeModal(false);
    setPendingPdfFiles({textFiles: [], scannedFiles: []});
    setError(null);
    setConfigConfirmed(false);
    setShowConfig(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm"
            >
              <FileSpreadsheet size={24} />
            </motion.div>
            <div>
              <motion.h1 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-3xl font-bold tracking-tight text-slate-900"
              >
                Digi-Trans <span className="text-blue-600">ByExcel</span>
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-slate-500 text-sm font-medium"
              >
                Convierte tus facturas al formato contable estándar
              </motion.p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!configConfirmed && !file && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-100">
                <AlertCircle size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Configuración Pendiente</span>
              </div>
            )}
            <button 
              onClick={() => setShowConfig(!showConfig)}
              className={cn(
                "px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 font-semibold text-sm shadow-sm border",
                showConfig 
                  ? "bg-blue-50 text-blue-700 border-blue-200" 
                  : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
              )}
            >
              <RefreshCw className={cn("w-4 h-4 transition-transform duration-500", showConfig && "rotate-180")} />
              Configuración
            </button>
            <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Sistema Activo</span>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {showConfig && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -10 }}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -10 }}
              className="overflow-hidden"
            >
              <div className="glass-panel rounded-2xl p-6 border border-blue-100 bg-blue-50/30">
                <div className="flex items-center gap-2 mb-4">
                  <RefreshCw className="text-blue-600 w-5 h-5" />
                  <h2 className="text-lg font-bold text-slate-900">Parámetros de Formato</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cuenta Mayor (Filas)</label>
                    <select 
                      value={config.cuentaMayorRows}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        let newSummary = config.cuentaMayorSummary;
                        
                        // If switching to desembolsos, check if current bank is allowed
                        if (newVal === "212103" || newVal === "113301") {
                          const allowedBanks = ["111207", "111208", "111205"];
                          if (!allowedBanks.includes(config.cuentaMayorSummary)) {
                            newSummary = "";
                          }
                        }

                        setConfig({
                          ...config, 
                          cuentaMayorRows: newVal,
                          cuentaMayorSummary: newSummary,
                          // Reset codAnalisis when switching options, but don't auto-fill
                          codAnalisis: ""
                        });
                      }}
                      className={cn(
                        "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer",
                        !config.cuentaMayorRows && "border-amber-300 ring-1 ring-amber-100"
                      )}
                    >
                      <option value="" disabled>Seleccione una cuenta...</option>
                      <option value="212103">Desembolsos por pagar</option>
                      <option value="113301">Desembolsos</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cuenta Mayor (Resumen)</label>
                    <select 
                      value={config.cuentaMayorSummary}
                      onChange={(e) => setConfig({...config, cuentaMayorSummary: e.target.value})}
                      className={cn(
                        "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer",
                        !config.cuentaMayorSummary && "border-amber-300 ring-1 ring-amber-100"
                      )}
                    >
                      <option value="" disabled>Seleccione un banco...</option>
                      {BANKS
                        .filter(bank => {
                          if (config.cuentaMayorRows === "212103" || config.cuentaMayorRows === "113301") {
                            return ["111207", "111208", "111205"].includes(bank.code);
                          }
                          return true;
                        })
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((bank) => (
                          <option key={bank.code} value={bank.code}>
                            {bank.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cód. Análisis</label>
                    <select 
                      value={config.codAnalisis}
                      onChange={(e) => setConfig({...config, codAnalisis: e.target.value})}
                      className={cn(
                        "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer",
                        !config.codAnalisis && "border-amber-300 ring-1 ring-amber-100"
                      )}
                    >
                      <option value="" disabled>Seleccione un proveedor...</option>
                      {config.cuentaMayorRows === "212103" ? (
                        PROVIDERS.filter(p => p.code.length > 5).map((provider) => (
                          <option key={provider.code} value={provider.code}>
                            {provider.name}
                          </option>
                        ))
                      ) : config.cuentaMayorRows === "113301" ? (
                        PROVIDERS.filter(p => p.code.length <= 5).map((provider) => (
                          <option key={provider.code} value={provider.code}>
                            {provider.name}
                          </option>
                        ))
                      ) : (
                        <option value="">Sin opciones disponibles</option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => {
                      setConfigConfirmed(true);
                      setShowConfig(false);
                    }}
                    disabled={
                      !config.cuentaMayorRows || 
                      !config.cuentaMayorSummary || 
                      !config.codAnalisis
                    }
                    className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md shadow-blue-100"
                  >
                    Confirmar Parámetros y Continuar
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="space-y-6">
          {/* Loading Overlay */}
          <AnimatePresence>
            {(isProcessing || isAiProcessing) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6"
              >
                <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl text-center space-y-6">
                  <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto relative overflow-hidden">
                    {isAiProcessing ? (
                      <RefreshCw className="w-10 h-10 animate-spin" />
                    ) : (
                      <Files className="w-10 h-10 animate-pulse" />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-slate-900">
                      {isAiProcessing ? 'Procesando con IA...' : 'Procesando Archivos...'}
                    </h3>
                    <p className="text-slate-500 text-sm">
                      {isAiProcessing 
                        ? 'Estamos analizando tus facturas escaneadas. Esto puede tardar unos segundos.' 
                        : 'Estamos extrayendo y transformando tus datos contables.'}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-blue-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${processingProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <span>Progreso</span>
                      <span>{processingProgress}%</span>
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col gap-3">
                    <div className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      <RefreshCw size={12} className="animate-spin" />
                      No cierres esta ventana
                    </div>
                    
                    <button
                      onClick={() => {
                        isCancelled.current = true;
                        setIsProcessing(false);
                        setIsAiProcessing(false);
                        setProcessingProgress(0);
                      }}
                      className="text-slate-400 hover:text-red-500 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1"
                    >
                      <X size={12} />
                      Cancelar Proceso
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload Section - Only visible after config is confirmed */}
          <AnimatePresence mode="wait">
            {!configConfirmed && !file ? (
              <motion.div
                key="config-step"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="glass-panel rounded-3xl p-12 text-center border-2 border-dashed border-slate-200"
              >
                <div className="max-w-md mx-auto space-y-4">
                  <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <RefreshCw size={40} />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Paso 1: Configuración</h2>
                  <p className="text-slate-500">
                    Por favor, selecciona los parámetros de formato arriba para habilitar la carga de archivos.
                  </p>
                  <div className="pt-4">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-xs font-bold uppercase tracking-widest">
                      Esperando Configuración
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : !file ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {/* Excel Upload Zone */}
                <div className="relative">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="excel-upload"
                    ref={fileInputRef}
                  />
                  <label
                    htmlFor="excel-upload"
                    className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-300 rounded-3xl bg-white hover:bg-slate-50 hover:border-blue-400 transition-all cursor-pointer group"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <div className="p-4 bg-slate-100 rounded-full group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors mb-4">
                        <FileSpreadsheet className="w-8 h-8 text-slate-400 group-hover:text-blue-500" />
                      </div>
                      <p className="mb-2 text-sm text-slate-700">
                        <span className="font-semibold">Cargar Excel</span>
                      </p>
                      <p className="text-xs text-slate-500 px-4 text-center">XLSX, XLS o CSV (máx. 10MB)</p>
                    </div>
                  </label>
                </div>

                {/* PDF Upload Zone */}
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    multiple
                    className="hidden"
                    id="pdf-upload"
                    ref={pdfInputRef}
                  />
                  <label
                    htmlFor="pdf-upload"
                    className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-300 rounded-3xl bg-white hover:bg-slate-50 hover:border-indigo-400 transition-all cursor-pointer group"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <div className="p-4 bg-slate-100 rounded-full group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors mb-4">
                        <FileText className="w-8 h-8 text-slate-400 group-hover:text-indigo-500" />
                      </div>
                      <p className="mb-2 text-sm text-slate-700">
                        <span className="font-semibold">Cargar PDF</span>
                      </p>
                      <p className="text-xs text-slate-500 px-4 text-center">Facturas digitales (puedes subir varias)</p>
                    </div>
                  </label>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* File Info Card */}
                <div className="glass-panel rounded-2xl p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{file.name}</h3>
                      <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                    </div>
                  </div>
                  <button 
                    onClick={reset}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                  {!transformedData ? (
                    <button
                      onClick={transformData}
                      disabled={isProcessing}
                      className="flex-1 bg-slate-900 text-white py-4 px-6 rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <RefreshCw className="animate-spin" size={20} />
                      ) : (
                        <RefreshCw size={20} />
                      )}
                      {isProcessing ? 'Procesando...' : 'Transformar Archivo'}
                    </button>
                  ) : (
                    <button
                      onClick={downloadExcel}
                      className="flex-1 bg-blue-600 text-white py-4 px-6 rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                      <Download size={20} />
                      Descargar Excel Transformado
                    </button>
                  )}
                </div>

                {/* Preview Section */}
                {data && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        Vista Previa {transformedData ? '(Resultado)' : '(Origen)'}
                      </h2>
                      {transformedData && (
                        <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={12} /> Transformación Exitosa
                        </span>
                      )}
                    </div>
                    
                    <div className="glass-panel rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              {(transformedData || data).headers.map((header, i) => (
                                <th key={i} className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(transformedData || data).rows.slice(0, 5).map((row, i) => (
                              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                {row.map((cell: any, j: number) => {
                                  let displayValue = typeof cell === 'number' ? Math.round(cell) : String(cell || '-');
                                  // Ocultar el prefijo ' en la vista previa si es una fecha
                                  if (transformedData && j === 15 && typeof displayValue === 'string' && displayValue.startsWith("'")) {
                                    displayValue = displayValue.substring(1);
                                  }
                                  return (
                                    <td key={j} className="px-6 py-4 text-slate-600 whitespace-nowrap">
                                      {displayValue}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {(transformedData || data).rows.length > 5 && (
                        <div className="p-4 bg-slate-50/50 text-center text-xs text-slate-400 border-t border-slate-100">
                          Mostrando las primeras 5 filas de {(transformedData || data).rows.length}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message Modal */}
          <AnimatePresence>
            {error && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-red-100"
                >
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <AlertCircle size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-4">
                      Error de Procesamiento
                    </h3>
                    <p className="text-slate-600 mb-8 leading-relaxed">
                      {error}
                    </p>
                    <button
                      onClick={() => setError(null)}
                      className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                    >
                      Entendido
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </main>

        {/* Custom Alert Modal - Invalid Amounts */}
        <AnimatePresence>
          {showCustomAlert && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
              >
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <AlertCircle size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-4">
                    Atención: Montos Inválidos
                  </h3>
                  <p className="text-slate-600 mb-6 leading-relaxed">
                    Se han detectado montos que no pudieron procesarse o son 0 en las siguientes coordenadas del archivo original:
                  </p>
                  <div className="bg-slate-50 rounded-xl p-4 mb-8 max-h-32 overflow-y-auto">
                    <p className="font-mono text-sm font-bold text-slate-700 break-words">
                      {invalidAmountCoords.join(', ')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCustomAlert(false)}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-[0.98] shadow-lg shadow-slate-200"
                  >
                    Aceptar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* PDF Processing Type Modal */}
        <AnimatePresence>
          {showPdfTypeModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100"
              >
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Files size={32} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-4">
                    Configuración de Procesamiento
                  </h3>
                  
                  {pendingPdfFiles.textFiles.length > 0 && pendingPdfFiles.scannedFiles.length > 0 ? (
                    <p className="text-slate-600 mb-8 leading-relaxed">
                      Se han detectado <span className="font-bold text-blue-600">{pendingPdfFiles.textFiles.length} archivos digitales</span> y <span className="font-bold text-indigo-600">{pendingPdfFiles.scannedFiles.length} archivos escaneados</span>. ¿Cómo desea proceder?
                    </p>
                  ) : (
                    <p className="text-slate-600 mb-8 leading-relaxed">
                      Se han detectado <span className="font-bold text-indigo-600">{pendingPdfFiles.scannedFiles.length} archivos escaneados</span>. Estos requieren Inteligencia Artificial para ser leídos.
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-3">
                    {pendingPdfFiles.textFiles.length > 0 && (
                      <button
                        onClick={() => extractDataFromPdfs(pendingPdfFiles.textFiles)}
                        className="w-full py-4 bg-blue-50 text-blue-700 rounded-2xl font-bold hover:bg-blue-100 transition-all flex items-center justify-center gap-2 border border-blue-100"
                      >
                        <FileText size={20} />
                        Procesar solo Digitales (Rápido)
                      </button>
                    )}
                    
                    <button
                      onClick={() => processScannedPdfsWithAI(pendingPdfFiles.scannedFiles)}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                    >
                      <RefreshCw size={20} />
                      Procesar Escaneados con IA
                    </button>

                    {pendingPdfFiles.textFiles.length > 0 && (
                      <button
                        onClick={() => processAllPdfsMixed(pendingPdfFiles.textFiles, pendingPdfFiles.scannedFiles)}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                      >
                        <Files size={20} />
                        Procesar Ambos (Mezcla Completa)
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setShowPdfTypeModal(false);
                        setPendingPdfFiles({textFiles: [], scannedFiles: []});
                        setIsProcessing(false);
                      }}
                      className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-all mt-2"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Footer / Instructions */}
        <footer className="pt-8 border-t border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Paso 1</div>
              <p className="text-sm text-slate-600">Sube tu archivo Excel o PDF original con los datos crudos.</p>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Paso 2</div>
              <p className="text-sm text-slate-600">El sistema procesará las columnas o extraerá los datos del PDF y aplicará el nuevo formato.</p>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Paso 3</div>
              <p className="text-sm text-slate-600">Descarga el archivo listo para usar en tu sistema de destino.</p>
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <p className="text-xs font-medium text-slate-400 italic">For Larrañaga</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
