import {
    Column,
    Entity,
    OneToMany,
    PrimaryColumn,
    RelationCount,
} from "../../../../../src"
import { Entry } from "./Entry"

@Entity()
export class Account {
    @PrimaryColumn()
    id: number

    @Column({ name: "display_name" })
    name: string

    @OneToMany(() => Entry, (entry) => entry.account)
    entries: Entry[]

    @RelationCount((account: Account) => account.entries)
    entryCount: number
}
