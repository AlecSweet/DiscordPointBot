import { Schema, model, models, Model } from "mongoose";
import isDuplicateKeyError from "./duplicateKey";

const CLAIM_LIFE = '30m'

interface IMessageClaim {
    _id: string
    createdAt: Date
}

const messageClaimSchema = new Schema({
    _id: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: CLAIM_LIFE,
    },
}, {versionKey: false})

const messageClaimModel: Model<IMessageClaim> = models.messageClaim || model<IMessageClaim>('messageClaim', messageClaimSchema);

export default messageClaimModel

export const claimMessage = (messageId: string): Promise<boolean> =>
    messageClaimModel.create({_id: messageId}).then(() => true, (err) => {
        if (isDuplicateKeyError(err)) return false
        throw err
    })
