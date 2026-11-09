export const tecnicosTechSoul = ['Villanotec', 'Emiliano', 'Yuliana']

export function comisionEmiliano(total, gastos) {
  const gananciaEnCentavos = Math.max(0, Math.round(Number(total || 0) * 100) - Math.round(Number(gastos || 0) * 100))
  return Math.round(gananciaEnCentavos * 0.10) / 100
}
