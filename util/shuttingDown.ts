let shuttingDown = false

export const setShuttingDown = (value: boolean): void => { shuttingDown = value }

export const isShuttingDown = (): boolean => shuttingDown
