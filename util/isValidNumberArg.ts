export const isValidNumberArg = (number: number): boolean => {
    return !isNaN(number) && Number.isInteger(number) && number > 0
}