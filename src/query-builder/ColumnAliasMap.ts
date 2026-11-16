/** Result-column names shared by the SQL generator and entity hydrator. */
export class ColumnAliasMap {
    private readonly aliases = new Map<string, Map<string, string>>()
    private readonly reserved: Set<string>
    private next = 0

    constructor(reserved: Iterable<string> = []) {
        this.reserved = new Set(reserved)
    }

    set(alias: string, column: string, name: string): void {
        let columns = this.aliases.get(alias)
        if (!columns) this.aliases.set(alias, (columns = new Map()))
        columns.set(column, name)
        this.reserved.add(name)
    }

    get(alias: string, column: string): string {
        let columns = this.aliases.get(alias)
        if (!columns) this.aliases.set(alias, (columns = new Map()))
        let name = columns.get(column)
        if (name === undefined) {
            do {
                name = `c${this.next++}`
            } while (this.reserved.has(name))
            columns.set(column, name)
            this.reserved.add(name)
        }
        return name
    }
}
