import { supabase } from './supabase'

export async function subirArchivo(bucket, file, carpeta = 'archivos') {
  if (!file) {
    throw new Error('No se seleccionó archivo')
  }

  const extension = file.name.split('.').pop()
  const nombreArchivo = `${carpeta}/${Date.now()}-${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(nombreArchivo, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(nombreArchivo)

  return data.publicUrl
}

export async function subirEvidencia(file, carpeta = 'ordenes') {
  return subirArchivo('evidencias', file, carpeta)
}

export async function subirLogo(file) {
  return subirArchivo('logos', file, 'logos')
}

export async function subirFirma(file) {
  return subirArchivo('logos', file, 'firmas')
}
