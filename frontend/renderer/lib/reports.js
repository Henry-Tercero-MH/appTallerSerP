import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── utilidades ─────────────────────────────────────────────────────────────

/** Nombre de empresa desde settings en localStorage (fallback al app name) */
function getCompanyName() {
  try {
    // intentamos leer el valor guardado por ThemeProvider en settings
    const raw = localStorage.getItem('app-settings')
    if (raw) {
      const s = JSON.parse(raw)
      if (s?.business?.business_name) return s.business.business_name
    }
  } catch (_) { /* ignorar */ }
  return localStorage.getItem('app-name') ?? 'Sistema POS'
}

/** Fecha actual en formato YYYY-MM-DD (seguro para nombres de archivo) */
function isoDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Fecha actual legible en español */
function dateLabel() {
  return new Intl.DateTimeFormat('es', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date())
}

/** Formatea datetime de la DB a string legible */
function fmtDateTime(d) {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('es', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(d.replace(' ', 'T')))
  } catch (_) { return d }
}

/** Moneda GTQ */
function currency(n) {
  return new Intl.NumberFormat('es', {
    style: 'currency', currency: 'GTQ', minimumFractionDigits: 2,
  }).format(n ?? 0)
}

// ─── helpers Excel ───────────────────────────────────────────────────────────

function downloadXlsx(wb, slug) {
  XLSX.writeFile(wb, `${slug}_${isoDate()}.xlsx`)
}

/** Aplica negrita a una fila completa en un sheet */
function boldRow(ws, rowIdx, colCount) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c })
    if (ws[addr]) ws[addr].s = { font: { bold: true } }
  }
}

// ─── helpers PDF ─────────────────────────────────────────────────────────────

/** @type {[number,number,number]} */ const PRIMARY = [30, 30, 30]
/** @type {[number,number,number]} */ const GRAY    = [230, 230, 230]
/** @type {[number,number,number]} */ const ALERT   = [0, 0, 0]

/**
 * Dibuja encabezado estándar: nombre empresa, título y subtítulo.
 * Devuelve la Y donde termina el encabezado.
 */
function pdfHeader(doc, title, subtitle) {
  const company = getCompanyName()

  // Nombre empresa
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text(company.toUpperCase(), 14, 14)

  // Línea separadora
  doc.setDrawColor(30, 30, 30)
  doc.setLineWidth(0.5)
  doc.line(14, 17, doc.internal.pageSize.width - 14, 17)

  // Título
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text(title, 14, 25)

  // Subtítulo
  if (subtitle) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(110, 110, 110)
    doc.text(subtitle, 14, 31)
    doc.setTextColor(30, 30, 30)
    return 36
  }
  return 31
}

/** Pie de página con número de página */
function pdfFooter(doc) {
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const w = doc.internal.pageSize.width
    const h = doc.internal.pageSize.height
    doc.setFontSize(7.5)
    doc.setTextColor(150)
    doc.text(`${getCompanyName()} — Generado el ${dateLabel()}`, 14, h - 6)
    doc.text(`Pagina ${i} de ${pages}`, w - 14, h - 6, { align: 'right' })
    doc.setTextColor(30, 30, 30)
  }
}

// ─── 1. Ventas del dia ───────────────────────────────────────────────────────

export function exportDailySalesExcel({ summary, topProducts }) {
  const company = getCompanyName()
  const wb = XLSX.utils.book_new()

  // Hoja resumen
  const ws1 = XLSX.utils.aoa_to_sheet([
    [company],
    ['Reporte de ventas del dia', dateLabel()],
    [],
    ['Metrica', 'Valor'],
    ['Ventas realizadas', summary?.sale_count ?? 0],
    ['Subtotal', summary?.subtotal ?? 0],
    ['IVA cobrado', summary?.tax_amount ?? 0],
    ['Total del dia', summary?.total ?? 0],
  ])
  ws1['!cols'] = [{ wch: 26 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen del dia')

  // Hoja top productos
  const ws2 = XLSX.utils.aoa_to_sheet([
    [company],
    ['Top productos vendidos hoy', dateLabel()],
    [],
    ['#', 'Codigo', 'Producto', 'Unidades vendidas', 'Ingresos'],
    ...topProducts.map((p, i) => [i + 1, p.code ?? '—', p.name ?? '—', p.units_sold, p.revenue]),
  ])
  ws2['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 38 }, { wch: 18 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Top productos')

  downloadXlsx(wb, 'ventas_del_dia')
}

export function exportDailySalesPDF({ summary, topProducts }) {
  const doc = new jsPDF()
  const startY = pdfHeader(doc, 'Ventas del dia', `Resumen correspondiente al ${dateLabel()}`)

  autoTable(doc, {
    startY,
    head: [['Metrica', 'Valor']],
    body: [
      ['Ventas realizadas', `${summary?.sale_count ?? 0} ordenes`],
      ['Subtotal', currency(summary?.subtotal)],
      ['IVA cobrado', currency(summary?.tax_amount)],
      ['Total del dia', currency(summary?.total)],
    ],
    theme: 'grid',
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    tableWidth: 100,
  })

  if (topProducts.length > 0) {
    const y2 = doc.lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Top productos vendidos hoy', 14, y2)

    autoTable(doc, {
      startY: y2 + 4,
      head: [['#', 'Codigo', 'Producto', 'Unidades', 'Ingresos']],
      body: topProducts.map((p, i) => [
        i + 1, p.code ?? '—', p.name ?? '—', p.units_sold, currency(p.revenue),
      ]),
      theme: 'grid',
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
  }

  pdfFooter(doc)
  doc.save(`ventas_del_dia_${isoDate()}.pdf`)
}

// ─── 2. Historial de ventas ───────────────────────────────────────────────────

export function exportSalesHistoryExcel(sales, { from, to }) {
  const company = getCompanyName()
  const active  = sales.filter(s => s.status !== 'voided')
  const wb = XLSX.utils.book_new()

  const PAYMENT = { cash: 'Efectivo', credit: 'Credito', card: 'Tarjeta', transfer: 'Transferencia' }
  const CLIENT  = { cf: 'C/F', registered: 'Registrado', company: 'Empresa' }

  const header = ['Folio', 'Fecha', 'Cliente', 'NIT', 'Tipo cliente', 'Metodo de pago', 'Subtotal', 'IVA', 'Total', 'Estado']
  const rows = sales.map(s => [
    s.id,
    fmtDateTime(s.date),
    s.customer_name_snapshot ?? 'Consumidor Final',
    s.customer_nit_snapshot  ?? 'C/F',
    CLIENT[s.client_type]    ?? s.client_type  ?? '—',
    PAYMENT[s.payment_method] ?? s.payment_method ?? '—',
    s.subtotal,
    s.tax_amount,
    s.total,
    s.status === 'voided' ? 'Anulada' : 'Activa',
  ])

  const ws = XLSX.utils.aoa_to_sheet([
    [company],
    [`Historial de ventas: ${from} al ${to}`],
    [],
    header,
    ...rows,
    [],
    ['', '', '', '', '', 'TOTALES',
      active.reduce((a, s) => a + s.subtotal, 0),
      active.reduce((a, s) => a + s.tax_amount, 0),
      active.reduce((a, s) => a + s.total, 0),
    ],
  ])
  ws['!cols'] = [
    { wch: 8 }, { wch: 18 }, { wch: 28 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Historial de ventas')
  downloadXlsx(wb, 'historial_ventas')
}

export function exportSalesHistoryPDF(sales, { from, to }) {
  const doc     = new jsPDF({ orientation: 'landscape' })
  const active  = sales.filter(s => s.status !== 'voided')
  const startY  = pdfHeader(doc, 'Historial de ventas', `Periodo: ${from} al ${to}`)

  const PAYMENT = { cash: 'Efectivo', credit: 'Credito', card: 'Tarjeta', transfer: 'Transferencia' }

  autoTable(doc, {
    startY,
    head: [['Folio', 'Fecha', 'Cliente', 'NIT', 'Pago', 'Subtotal', 'IVA', 'Total', 'Estado']],
    body: sales.map(s => [
      s.id,
      fmtDateTime(s.date),
      s.customer_name_snapshot ?? 'C/F',
      s.customer_nit_snapshot  ?? 'C/F',
      PAYMENT[s.payment_method] ?? s.payment_method ?? '—',
      currency(s.subtotal),
      currency(s.tax_amount),
      currency(s.total),
      s.status === 'voided' ? 'Anulada' : 'Activa',
    ]),
    foot: [['', '', '', '', 'TOTALES',
      currency(active.reduce((a, s) => a + s.subtotal, 0)),
      currency(active.reduce((a, s) => a + s.tax_amount, 0)),
      currency(active.reduce((a, s) => a + s.total, 0)),
      '',
    ]],
    theme: 'grid',
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: GRAY, textColor: [30, 30, 30], fontStyle: 'bold' },
    columnStyles: {
      5: { halign: 'right' }, 6: { halign: 'right' },
      7: { halign: 'right' }, 8: { halign: 'center' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.row.raw[8] === 'Anulada') {
        data.cell.styles.textColor = /** @type {[number,number,number]} */ ([0, 0, 0])
      }
    },
  })

  pdfFooter(doc)
  doc.save(`historial_ventas_${isoDate()}.pdf`)
}

// ─── 3. Inventario ───────────────────────────────────────────────────────────

export function exportInventoryExcel(products) {
  const company = getCompanyName()
  const wb = XLSX.utils.book_new()

  const ws = XLSX.utils.aoa_to_sheet([
    [company],
    ['Inventario de productos', dateLabel()],
    [],
    ['Codigo', 'Nombre', 'Marca', 'Categoria', 'Ubicacion', 'Precio', 'Stock', 'Stock min.', 'Estado'],
    ...products.map(p => [
      p.code, p.name, p.brand ?? '—', p.category ?? '—', p.location ?? '—',
      p.price, p.stock, p.min_stock,
      p.is_active === 1 ? 'Activo' : 'Inactivo',
    ]),
  ])
  ws['!cols'] = [
    { wch: 12 }, { wch: 34 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  downloadXlsx(wb, 'inventario')
}

export function exportInventoryPDF(products) {
  const doc    = new jsPDF({ orientation: 'landscape' })
  const active = products.filter(p => p.is_active === 1)
  const startY = pdfHeader(
    doc,
    'Inventario de productos',
    `${active.length} productos activos — ${dateLabel()}`
  )

  autoTable(doc, {
    startY,
    head: [['Codigo', 'Nombre', 'Categoria', 'Ubicacion', 'Precio', 'Stock', 'Min.', 'Estado']],
    body: products.map(p => [
      p.code, p.name, p.category ?? '—', p.location ?? '—',
      currency(p.price), p.stock, p.min_stock,
      p.is_active === 1 ? 'Activo' : 'Inactivo',
    ]),
    theme: 'grid',
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
    },
    didParseCell(data) {
      if (data.section === 'body') {
        const stock = Number(data.row.raw[5])
        const min   = Number(data.row.raw[6])
        if (!isNaN(stock) && !isNaN(min) && stock <= min) {
          data.cell.styles.textColor = /** @type {[number,number,number]} */ ([0, 0, 0])
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })

  pdfFooter(doc)
  doc.save(`inventario_${isoDate()}.pdf`)
}

// ─── 4. Clientes ─────────────────────────────────────────────────────────────

export function exportCustomersExcel(customers) {
  const company = getCompanyName()
  const wb = XLSX.utils.book_new()

  const ws = XLSX.utils.aoa_to_sheet([
    [company],
    ['Directorio de clientes', dateLabel()],
    [],
    ['ID', 'Nombre', 'NIT', 'Email', 'Telefono', 'Estado'],
    ...customers.map(c => [
      c.id, c.name, c.nit ?? 'C/F',
      c.email ?? '—', c.phone ?? '—',
      c.active === 1 ? 'Activo' : 'Inactivo',
    ]),
  ])
  ws['!cols'] = [
    { wch: 6 }, { wch: 34 }, { wch: 14 },
    { wch: 28 }, { wch: 14 }, { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
  downloadXlsx(wb, 'clientes')
}

// ─── 5. Hoja de pedido ───────────────────────────────────────────────────────

export function exportPurchaseOrderExcel(products, threshold) {
  const company = getCompanyName()
  const wb = XLSX.utils.book_new()

  const ws = XLSX.utils.aoa_to_sheet([
    [company],
    ['HOJA DE PEDIDO', dateLabel()],
    [`Productos con stock igual o menor a ${threshold} unidades`],
    [],
    ['Codigo', 'Descripcion', 'Categoria', 'Stock actual', 'Stock minimo', 'Cantidad sugerida', 'Proveedor / Notas'],
    ...products.map(p => [
      p.code,
      p.name,
      p.category ?? '—',
      p.stock,
      p.min_stock,
      Math.max(0, (p.min_stock * 3) - p.stock),
      '',
    ]),
    [],
    ['', `Total: ${products.length} producto(s) requieren reposicion`, '', '', '', '', ''],
  ])
  ws['!cols'] = [
    { wch: 12 }, { wch: 36 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja de pedido')
  downloadXlsx(wb, 'hoja_de_pedido')
}

export function exportPurchaseOrderPDF(products, threshold) {
  const doc    = new jsPDF()
  const startY = pdfHeader(
    doc,
    'HOJA DE PEDIDO',
    `Productos con stock igual o menor a ${threshold} unidades — ${dateLabel()}`
  )

  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text(
    `${products.length} producto(s) requieren reposicion`,
    14, startY + 2
  )
  doc.setTextColor(30, 30, 30)

  autoTable(doc, {
    startY: startY + 8,
    head: [['Codigo', 'Descripcion', 'Categoria', 'Stock', 'Min.', 'Cant. sugerida', 'Notas']],
    body: products.map(p => [
      p.code,
      p.name,
      p.category ?? '—',
      p.stock,
      p.min_stock,
      Math.max(0, (p.min_stock * 3) - p.stock),
      '',
    ]),
    foot: [['', `Total: ${products.length} productos`, '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: GRAY, fontStyle: 'bold', textColor: [30, 30, 30] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { minCellWidth: 35 },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 3) {
        if (Number(data.row.raw[3]) === 0) {
          data.cell.styles.textColor = /** @type {[number,number,number]} */ ([0, 0, 0])
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })

  pdfFooter(doc)
  doc.save(`hoja_de_pedido_${isoDate()}.pdf`)
}
