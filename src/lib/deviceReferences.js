const samsungA = 'https://www.prnewswire.com/mx/comunicados-de-prensa/samsung-lanza-en-mexico-la-nueva-serie-galaxy-a-con-funciones-de-ai-para-todos-302426685.html'
const samsungS = 'https://news.samsung.com/mx/samsung-inaugura-el-galaxy-ai-experience-zone-en-el-centro-comercial-perisur'
const motorolaG = 'https://motorolanews.com/mx/motorola-mexico-moto-g55-5g-moto-g35-5g/'
const motorolaG85 = 'https://motorolanews.com/mx/category/product/moto-g/page/4/'
const motorolaEdge = 'https://motorolanews.com/mx/motorola-edge-50-fusion-disponible-preventa-moto-buds/'
const xiaomi = 'https://www.mi.com/mx/support/terms/support-xiaomi-valentines-2026/'
const movistar = 'https://tienda.movistar.com.mx/marca/samsung.html?tecnologia=524'

// The tier is a workshop reference based on the model's positioning.
const references = [
  ['Samsung', 'Galaxy A07 4G', 'A07', 'Baja', 2199, 'Oferta publicada · agotado · nov. 2026', movistar],
  ['Samsung', 'Galaxy A26 5G', 'A26 5G', 'Media', 5999, 'Lanzamiento · 128 GB · abr. 2025', samsungA],
  ['Samsung', 'Galaxy A36 5G', 'A36', 'Media', 7499, 'Lanzamiento · 128 GB · abr. 2025', samsungA],
  ['Samsung', 'Galaxy A56 5G', 'A56', 'Media', 10999, 'Lanzamiento · 256 GB · abr. 2025', samsungA],
  ['Samsung', 'Galaxy S24 Ultra', 'S24 ULTRA', 'Alta', 30999, 'Lanzamiento · 256 GB · 2024', samsungS],
  ['Motorola', 'Moto G35 5G', 'G35 5G', 'Media', 4499, 'Lanzamiento · desde · 2024', motorolaG],
  ['Motorola', 'Moto G55 5G', 'G55', 'Media', 4999, 'Preventa · 2024', motorolaG],
  ['Motorola', 'Moto G85 5G', 'G85', 'Media', 5999, 'Lanzamiento · desde · 2024', motorolaG85],
  ['Motorola', 'Edge 50 Fusion', 'EDGE 50 FUSION', 'Media', 6999, 'Preventa · 2024', motorolaEdge],
  ['Xiaomi', 'Redmi 14C', 'REDMI 14C', 'Baja', 3499, 'Precio regular · 128 GB · feb. 2026', xiaomi],
  ['Xiaomi', 'Redmi Note 14 4G', 'REDMI NOTE 14 4G', 'Media', 5999, 'Precio regular · 256 GB · feb. 2026', xiaomi],
  ['Xiaomi', 'Redmi Note 14 Pro 4G', 'REDMI NOTE 14 PRO 4G', 'Media', 7999, 'Precio regular · 256 GB · feb. 2026', xiaomi],
  ['Xiaomi', 'Redmi Note 14 Pro 5G', 'REDMI NOTE 14 PRO 5G', 'Media', 9999, 'Precio regular · 256 GB · feb. 2026', xiaomi],
].map(([brand, model, catalogModel, tier, price, detail, source]) => ({
  brand, model, catalogModel, tier, price, detail, source,
}))

function modelKey(value) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

export function findDeviceReferences(query) {
  const key = modelKey(query)
  if (!key) return []
  return references.filter(({ brand, model, catalogModel }) => {
    const names = [model, catalogModel]
    if (/^(Galaxy|Moto) /i.test(model)) names.push(model.replace(/^\S+ /, ''))
    return names.some(name => key === modelKey(name) || key === modelKey(`${brand} ${name}`))
  })
}
