const WINDOW_MS = 60 * 1000
const REQUESTS = 60
const TRACKED = 5000
const GROUPS = 4

interface IWindow {
    startedAt: number
    requests: number
}

const windows = new Map<string, IWindow>()

let sweptAt = 0

const withoutPort = (address: string): string => {
    const bracketed = address.match(/^\[(.+)\](?::\d+)?$/)
    if (bracketed !== null) return bracketed[1]

    const parts = address.split(":")
    return parts.length === 2 && parts[0].includes(".") ? parts[0] : address
}

const network = (rawAddress: string): string => {
    const address = withoutPort(rawAddress)
    if (!address.includes(":")) return address
    if (address.includes(".")) return address.slice(address.lastIndexOf(":") + 1)

    const [leading, trailing] = address.split("::")
    const head = leading.split(":").filter(group => group.length > 0)
    const tail = trailing === undefined ? [] : trailing.split(":").filter(group => group.length > 0)
    const gap = trailing === undefined ? [] : new Array(Math.max(0, 8 - head.length - tail.length)).fill("0")

    return head.concat(gap, tail).slice(0, GROUPS).map(group => group.replace(/^0+(?=.)/, "")).join(":")
}

const forgetWindows = (now: number): void => {
    if (now - sweptAt < WINDOW_MS && windows.size <= TRACKED) return
    sweptAt = now

    windows.forEach((window, key) => {
        if (now - window.startedAt >= WINDOW_MS) windows.delete(key)
    })

    while (windows.size > TRACKED) {
        const oldest = windows.keys().next()
        if (oldest.done) return
        windows.delete(oldest.value)
    }
}

export const clientAddress = (forwardedFor: string | string[] | undefined): string =>
    `${forwardedFor ?? ""}`.split(",")
        .map(address => address.trim())
        .filter(address => address.length > 0)
        .pop() ?? ""

export const retryAfter = (address: string, now = Date.now()): number | undefined => {
    const key = network(address)
    if (key.length === 0) return undefined

    forgetWindows(now)

    const window = windows.get(key)
    if (window === undefined || now - window.startedAt >= WINDOW_MS) {
        windows.delete(key)
        windows.set(key, {startedAt: now, requests: 1})
        return undefined
    }

    window.requests += 1
    return window.requests > REQUESTS ? Math.ceil((window.startedAt + WINDOW_MS - now) / 1000) : undefined
}

export const forgetAddresses = (): void => {
    windows.clear()
    sweptAt = 0
}
