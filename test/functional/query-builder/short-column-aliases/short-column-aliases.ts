import "../../../utils/test-setup"
import { expect } from "chai"
import { DataSource } from "../../../../src"
import { DriverUtils } from "../../../../src/driver/DriverUtils"
import { ColumnAliasMap } from "../../../../src/query-builder/ColumnAliasMap"
import {
    createTestingConnections,
    closeTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { Account } from "./entity/Account"
import { Entry } from "./entity/Entry"
import { Composite } from "./entity/Composite"

const root = "account_with_a_deliberately_long_and_nested_relation_alias"
const child = root + "__entries_with_another_deliberately_long_alias"

describe("query builder > short entity column aliases", () => {
    let connections: DataSource[]
    before(
        async () =>
            (connections = await createTestingConnections({
                entities: [Account, Entry, Composite],
                enabledDrivers: ["postgres", "sqljs"],
            })),
    )
    beforeEach(async () => {
        await reloadTestingDatabases(connections)
        for (const connection of connections) {
            await connection.getRepository(Account).save([
                { id: 1, name: "Alpha" },
                { id: 2, name: "Beta" },
                { id: 3, name: "Empty" },
            ])
            await connection.getRepository(Entry).save([
                { id: 11, label: "First", account: { id: 1 } },
                { id: 12, label: "Second", account: { id: 1 } },
                { id: 13, label: "Third", account: { id: 2 } },
            ])
            await connection.getRepository(Composite).save([
                { tenant: "a", number: 1, value: "one", account: { id: 1 } },
                { tenant: "b", number: 1, value: "two", account: { id: 2 } },
            ])
        }
    })
    after(() => closeTestingConnections(connections))

    it("hydrates joined entities, empty relations, relation ids and counts", async () => {
        for (const connection of connections) {
            const query = connection
                .getRepository(Account)
                .createQueryBuilder(root)
                .leftJoinAndSelect(root + ".entries", child)
                .orderBy(root + ".id")
                .addOrderBy(child + ".id")
            const [accounts, count] = await query.getManyAndCount()
            expect(count).to.equal(3)
            expect(
                accounts.map((account) => ({
                    id: account.id,
                    name: account.name,
                    count: account.entryCount,
                    entries: account.entries.map((entry) => ({
                        id: entry.id,
                        label: entry.label,
                        accountId: entry.accountId,
                    })),
                })),
            ).to.deep.equal([
                {
                    id: 1,
                    name: "Alpha",
                    count: 2,
                    entries: [
                        { id: 11, label: "First", accountId: 1 },
                        { id: 12, label: "Second", accountId: 1 },
                    ],
                },
                {
                    id: 2,
                    name: "Beta",
                    count: 1,
                    entries: [{ id: 13, label: "Third", accountId: 2 }],
                },
                { id: 3, name: "Empty", count: 0, entries: [] },
            ])
        }
    })

    it("keeps aliases consistent through distinct pagination and clones", async () => {
        for (const connection of connections) {
            const query = connection
                .getRepository(Account)
                .createQueryBuilder(root)
                .leftJoinAndSelect(root + ".entries", child)
                .orderBy(root + ".name")
                .skip(1)
                .take(1)
            const [accounts, count] = await query.clone().getManyAndCount()
            expect(count).to.equal(3)
            expect(accounts.map((account) => account.name)).to.deep.equal([
                "Beta",
            ])
            expect(
                accounts[0].entries.map((entry) => entry.label),
            ).to.deep.equal(["Third"])
            expect((await query.getOne())!.name).to.equal("Beta")
        }
    })

    it("supports composite primary keys and pagination", async () => {
        for (const connection of connections) {
            const values = await connection
                .getRepository(Composite)
                .createQueryBuilder(root)
                .leftJoinAndSelect(root + ".account", child)
                .orderBy(root + ".tenant")
                .skip(1)
                .take(1)
                .getMany()
            expect(values).to.have.length(1)
            expect(values[0]).to.include({
                tenant: "b",
                number: 1,
                value: "two",
            })
            expect(values[0].account.name).to.equal("Beta")
        }
    })

    it("preserves raw keys when a builder is reused after an entity read", async () => {
        for (const connection of connections) {
            const query = connection
                .getRepository(Account)
                .createQueryBuilder("account")
                .orderBy("account.id")
            await query.getMany()
            const expected = [
                { account_id: 1, account_display_name: "Alpha" },
                { account_id: 2, account_display_name: "Beta" },
                { account_id: 3, account_display_name: "Empty" },
            ]
            expect(await query.getRawMany()).to.deep.equal(expected)
            expect((await query.getRawAndEntities()).raw).to.deep.equal(
                expected,
            )
            expect(await query.getRawOne()).to.deep.equal(expected[0])
        }
    })

    it("keeps partial selections, named projections and reserved aliases", async () => {
        for (const connection of connections) {
            const query = connection
                .getRepository(Account)
                .createQueryBuilder("account")
                .select("account.name")
                .addSelect("123", "c0")
                .orderBy("account.id")
            expect(
                (await query.getMany()).map((account) => ({
                    name: account.name,
                    id: account.id,
                })),
            ).to.deep.equal([
                { name: "Alpha", id: undefined },
                { name: "Beta", id: undefined },
                { name: "Empty", id: undefined },
            ])
            expect((await query.getRawMany())[0]).to.deep.equal({
                account_display_name: "Alpha",
                c0: 123,
            })
            expect(
                (await connection
                    .getRepository(Account)
                    .createQueryBuilder("account")
                    .select("account.id")
                    .addSelect("account.name", "named")
                    .where("account.id = 1")
                    .getOne())!.name,
            ).to.equal("Alpha")
        }
    })

    it("emits short SQL result names without hashing per hydrated row", async () => {
        for (const connection of connections) {
            const query = connection
                .getRepository(Account)
                .createQueryBuilder(root)
                .leftJoinAndSelect(root + ".entries", child)
            const sql: string[] = []
            const runner = connection.createQueryRunner()
            const original = runner.query.bind(runner)
            runner.query = ((text: string, ...args: any[]) => {
                sql.push(text)
                return original(text, ...args)
            }) as typeof runner.query
            try {
                await query.setQueryRunner(runner).getMany()
                const select = sql.find((text) => text.includes("LEFT JOIN"))!
                expect(select).to.match(/AS ["`]?c0["`]?/)
                expect(select).not.to.include(
                    DriverUtils.buildAlias(
                        connection.driver,
                        undefined,
                        child,
                        "label",
                    ),
                )
            } finally {
                await runner.release()
            }
        }
    })

    it("also compiles legacy result aliases once regardless of row count", async () => {
        for (const connection of connections) {
            await connection.getRepository(Entry).insert(
                Array.from({ length: 200 }, (_, index) => ({
                    id: index + 100,
                    label: "Additional entry",
                    account: { id: 1 },
                })),
            )
            const measure = async (maximum: number) => {
                const query = connection
                    .getRepository(Account)
                    .createQueryBuilder(root)
                    .leftJoinAndSelect(root + ".entries", child)
                    .where(child + ".id <= :maximum", { maximum })
                const original = DriverUtils.buildAlias
                let calls = 0
                DriverUtils.buildAlias = (...args) => {
                    calls++
                    return original(...args)
                }
                try {
                    const { raw } = await query.getRawAndEntities()
                    return { calls, rows: raw.length }
                } finally {
                    DriverUtils.buildAlias = original
                }
            }
            const small = await measure(13)
            const large = await measure(1000)
            expect(small.rows).to.equal(3)
            expect(large.rows).to.equal(203)
            expect(large.calls).to.equal(small.calls)
        }
    })

    it("retains hidden primary keys through paginated partial-selection clones", async () => {
        for (const connection of connections) {
            const accounts = await connection
                .getRepository(Account)
                .createQueryBuilder(root)
                .select(root + ".name")
                .leftJoinAndSelect(root + ".entries", child)
                .orderBy(root + ".name")
                .skip(1)
                .take(1)
                .getMany()
            expect(accounts).to.have.length(1)
            expect(accounts[0].name).to.equal("Beta")
            expect(accounts[0].id).to.equal(undefined)
            expect(
                accounts[0].entries.map((entry) => entry.label),
            ).to.deep.equal(["Third"])
        }
    })

    it("restores raw keys after a failed entity query", async () => {
        for (const connection of connections) {
            const query = connection
                .getRepository(Account)
                .createQueryBuilder("account")
                .where("nonexistent_alias_column = 1")
            await expect(query.getMany()).to.be.rejected
            const raw = await query.where("account.id = 1").getRawOne()
            expect(raw).to.deep.equal({
                account_id: 1,
                account_display_name: "Alpha",
            })
        }
    })
})

describe("short column alias allocation", () => {
    it("keeps distinct alias-column pairs distinct and avoids user projection names", () => {
        const aliases = new ColumnAliasMap(["c0", "c2"])
        expect(aliases.get("a_b", "c")).to.equal("c1")
        expect(aliases.get("a", "b_c")).to.equal("c3")
        expect(aliases.get("a_b", "c")).to.equal("c1")
    })
})
