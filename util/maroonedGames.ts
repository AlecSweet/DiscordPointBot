import { isShuttingDown } from "./shuttingDown"

interface IMaroonedRow {
    ownerId: string
    startDate: Date
}

const sweepMarooned = async <T extends IMaroonedRow>(
    findAll: () => Promise<T[]>,
    maroonedMs: number,
    label: string,
    cancel: (ownerId: string, row: T) => Promise<void>,
): Promise<void> => {
    const rows = await findAll()
    for (const row of rows) {
        if (isShuttingDown()) return

        if (Date.now() - row.startDate.getTime() > maroonedMs) {
            console.log(`deleting marooned ${label}`)
            await cancel(row.ownerId, row)
        }
    }
}

export default sweepMarooned
