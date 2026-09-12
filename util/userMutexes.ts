import { Mutex, MutexInterface, withTimeout } from "async-mutex"

const MUTEX_TIMEOUT_MS = 10000

export const userMutexes = new Map<string, MutexInterface>()

export const addUserMutex = (id: string) => {
    if (!userMutexes.has(id)) {
        userMutexes.set(id, withTimeout(new Mutex(), MUTEX_TIMEOUT_MS))
    }
}
