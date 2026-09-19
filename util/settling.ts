const settling = new Set<Promise<unknown>>()

export const whileSettling = <T>(run: () => Promise<T>): Promise<T> => {
    const running = run()
    settling.add(running)
    return running.finally(() => { settling.delete(running) })
}

export const settled = async (): Promise<void> => {
    while (settling.size > 0) {
        await Promise.allSettled(Array.from(settling))
    }
}
