import sleep from "../util/sleep"

const ATTEMPTS = 3
const BACKOFF_MS = 200

const DOUBLE_SPEND = "its points may be handed out a second time"

const retryWrite = async (write: () => PromiseLike<unknown>, describe: string, consequence = DOUBLE_SPEND): Promise<boolean> => {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
            await write()
            return true
        } catch (err) {
            console.log(`${describe} failed on attempt ${attempt} of ${ATTEMPTS}`, err)
            if (attempt < ATTEMPTS) await sleep(BACKOFF_MS * attempt)
        }
    }

    console.log(`ALERT ${describe} never went through, ${consequence}`)
    return false
}

export default retryWrite
