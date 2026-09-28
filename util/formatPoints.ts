const formatters = new Map<number, Intl.NumberFormat>()

const formatterFor = (fractionDigits: number): Intl.NumberFormat => {
    const found = formatters.get(fractionDigits)
    if (found !== undefined) return found

    const made = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    })
    formatters.set(fractionDigits, made)
    return made
}

const formatPoints = (points: number, fractionDigits = 0): string => formatterFor(fractionDigits).format(points)

export default formatPoints
