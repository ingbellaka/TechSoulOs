import { dataClient } from '../repositories/client'
import { BaseService } from './base.service'

class OrdenService extends BaseService {
  constructor() {
    super('ordenes')
  }

  listWithRelations() {
    return dataClient
      .from('ordenes')
      .select('*, clientes(nombre, telefono), equipos(tipo_equipo, marca, modelo)')
      .order('id', { ascending: false })
  }

  changeStatus(id, estado) {
    return dataClient.from('ordenes').update({ estado }).eq('id', id)
  }
}

export const ordenService = new OrdenService()
