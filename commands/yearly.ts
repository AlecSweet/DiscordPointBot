import { claimYearly } from "../util/claimUtil";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";

const yearly = textCommand({
    name: 'yearly',
    category: 'claim yearly',
    description: 'claim points',
    cooldown: '3s',
}, async (ctx) => {
    await withUserLock(ctx.authorId, ctx.message, async (user) => {
        await claimYearly(user, ctx.message)
    })
})

export default yearly
