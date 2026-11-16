import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
} from "../../../../../src"
import { Account } from "./Account"

@Entity()
export class Composite {
    @PrimaryColumn()
    tenant: string

    @PrimaryColumn()
    number: number

    @Column()
    value: string

    @ManyToOne(() => Account)
    @JoinColumn({ name: "account_id" })
    account: Account
}
