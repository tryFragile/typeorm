import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    RelationId,
} from "../../../../../src"
import { Account } from "./Account"

@Entity()
export class Entry {
    @PrimaryColumn()
    id: number

    @Column()
    label: string

    @ManyToOne(() => Account, (account) => account.entries)
    @JoinColumn({ name: "account_id" })
    account: Account

    @RelationId((entry: Entry) => entry.account)
    accountId: number
}
