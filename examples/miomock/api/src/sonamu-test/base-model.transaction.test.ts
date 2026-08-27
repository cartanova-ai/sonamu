import {
  BaseModelClass,
  DB,
  type DBPreset,
  PuriWrapper,
  transactional,
  UpsertBuilder,
} from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { DepartmentModel } from "../application/department/department.model";
import { EmployeeModel } from "../application/employee/employee.model";
import {
  departmentLoaderQueries,
  employeeLoaderQueries,
  employeeSubsetQueries,
} from "../application/sonamu.generated.sso";

class ExpectedRollback<T> extends Error {
  constructor(readonly result: T) {
    super("테스트 트랜잭션 롤백");
  }
}

class TransactionOwnerModelClass extends BaseModelClass {
  override getPuri(which: DBPreset): PuriWrapper {
    const activeTransaction = DB.getTransactionContext().getTransaction(which);
    if (activeTransaction) {
      return activeTransaction;
    }

    // 워커 DB의 r/w 별칭과 다른 연결에서 트랜잭션을 열어 전파 누락을 식별한다.
    return new PuriWrapper(DB.getDB("test"), new UpsertBuilder());
  }

  @transactional()
  async rollbackAfter<T>(callback: (trx: PuriWrapper) => Promise<T>): Promise<never> {
    const result = await callback(this.getPuri("w"));
    throw new ExpectedRollback(result);
  }
}

const TransactionOwnerModel = new TransactionOwnerModelClass();

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function runInRollbackTransaction<T>(callback: (trx: PuriWrapper) => Promise<T>): Promise<T> {
  try {
    await TransactionOwnerModel.rollbackAfter(callback);
  } catch (error) {
    if (error instanceof ExpectedRollback) {
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      return error.result as T;
    }
    throw error;
  }

  throw new Error("테스트 트랜잭션이 롤백되지 않았습니다");
}

bootstrap(vi);

describe("BaseModel 트랜잭션 전파", () => {
  test("다른 모델의 findMany가 활성 트랜잭션에서 count/list/both와 연속 변경을 조회한다", async () => {
    const initialName = "SON-533 트랜잭션 부서";
    const lockedName = "SON-533 잠금 이후 부서";
    const sequentialName = "SON-533 연속 조회 부서";

    const result = await runInRollbackTransaction(async (trx) => {
      const company = await trx
        .table("companies")
        .select({ id: "companies.id" })
        .orderBy("companies.id", "asc")
        .first();
      if (!company) {
        throw new Error("테스트할 회사가 없습니다");
      }

      const [inserted] = await trx
        .table("departments")
        .insert({
          name: initialName,
          company_id: company.id,
          parent_id: null,
          created_at: new Date(),
        })
        .returning("id");
      if (!inserted) {
        throw new Error("테스트 부서를 생성하지 못했습니다");
      }

      const countResult = await DepartmentModel.findMany("P2", {
        id: inserted.id,
        num: 1,
        page: 1,
        queryMode: "count",
      });
      const listResult = await DepartmentModel.findMany("P2", {
        id: inserted.id,
        num: 1,
        page: 1,
        queryMode: "list",
      });

      await trx
        .table("departments")
        .where("departments.id", inserted.id)
        .select({ id: "departments.id" })
        .forUpdate()
        .first();
      await trx
        .table("departments")
        .where("departments.id", inserted.id)
        .update({ name: lockedName });

      const bothResult = await DepartmentModel.findMany("P2", {
        id: inserted.id,
        num: 1,
        page: 1,
        queryMode: "both",
      });
      const transactionAfterFindMany = DB.getTransactionContext().getTransaction("w");

      await trx
        .table("departments")
        .where("departments.id", inserted.id)
        .update({ name: sequentialName });
      const sequentialResult = await DepartmentModel.findMany("P2", {
        id: inserted.id,
        num: 1,
        page: 1,
        queryMode: "list",
      });

      return {
        insertedId: inserted.id,
        countResult,
        listResult,
        bothResult,
        sequentialResult,
        reusedTransaction: transactionAfterFindMany === trx,
        distinctFromConfiguredReadDB: trx.knex !== DB.getDB("r"),
      };
    });

    expect(result.countResult).toEqual({ total: 1 });
    expect(result.listResult).toEqual({
      rows: [expect.objectContaining({ id: result.insertedId, name: initialName })],
    });
    expect(result.bothResult).toEqual({
      rows: [expect.objectContaining({ id: result.insertedId, name: lockedName })],
      total: 1,
    });
    expect(result.sequentialResult).toEqual({
      rows: [expect.objectContaining({ id: result.insertedId, name: sequentialName })],
    });
    expect(result.reusedTransaction).toBe(true);
    expect(result.distinctFromConfiguredReadDB).toBe(true);

    const rolledBack = await DB.getDB("test")("departments").where("id", result.insertedId).first();
    expect(rolledBack).toBeUndefined();
  });

  test("서로 다른 preset이 중첩되면 가장 안쪽 트랜잭션을 사용하고 종료 후 바깥 트랜잭션을 복원한다", async () => {
    const outerName = "SON-533 바깥 트랜잭션 부서";
    const innerName = "SON-533 안쪽 트랜잭션 부서";

    const result = await runInRollbackTransaction(async (outerTrx) => {
      const outerDepartment = await outerTrx
        .table("departments")
        .select({ id: "departments.id", name: "departments.name" })
        .orderBy("departments.id", "asc")
        .first();
      if (!outerDepartment) {
        throw new Error("바깥 트랜잭션을 검증할 부서가 없습니다");
      }

      await outerTrx
        .table("departments")
        .where("departments.id", outerDepartment.id)
        .update({ name: outerName });

      const fixturePuri = new PuriWrapper(DB.getDB("fixture"), new UpsertBuilder());
      const innerDepartment = await fixturePuri
        .table("departments")
        .select({ id: "departments.id", name: "departments.name" })
        .orderBy("departments.id", "asc")
        .first();
      if (!innerDepartment) {
        throw new Error("안쪽 트랜잭션을 검증할 부서가 없습니다");
      }

      let innerReadName: string | undefined;
      try {
        await fixturePuri.transaction(
          async (innerTrx) => {
            await innerTrx
              .table("departments")
              .where("departments.id", innerDepartment.id)
              .update({ name: innerName });

            const innerResult = await DepartmentModel.findMany("P2", {
              id: innerDepartment.id,
              num: 1,
              page: 1,
              queryMode: "list",
            });
            throw new ExpectedRollback(innerResult.rows[0]?.name);
          },
          { dbPreset: "fixture" },
        );
      } catch (error) {
        if (!(error instanceof ExpectedRollback)) {
          throw error;
          // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        }
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        innerReadName = error.result as string | undefined;
      }

      const outerResult = await DepartmentModel.findMany("P2", {
        id: outerDepartment.id,
        num: 1,
        page: 1,
        queryMode: "list",
      });

      return {
        outerDepartment,
        innerDepartment,
        innerReadName,
        outerReadName: outerResult.rows[0]?.name,
        outerTransactionRestored: DB.getTransactionContext().getActiveTransaction() === outerTrx,
      };
    });

    expect(result.innerReadName).toBe(innerName);
    expect(result.outerReadName).toBe(outerName);
    expect(result.outerTransactionRestored).toBe(true);

    const [outerRolledBack, innerRolledBack] = await Promise.all([
      DB.getDB("test")("departments").select("name").where("id", result.outerDepartment.id).first(),
      DB.getDB("fixture")("departments")
        .select("name")
        .where("id", result.innerDepartment.id)
        .first(),
    ]);
    expect(outerRolledBack?.name).toBe(result.outerDepartment.name);
    expect(innerRolledBack?.name).toBe(result.innerDepartment.name);
  });

  test("@transactional이 다른 preset 안에서 기존 같은 preset을 재사용하고 주변 scope를 복원한다", async () => {
    const result = await runInRollbackTransaction(async (outerTrx) => {
      const fixturePuri = new PuriWrapper(DB.getDB("fixture"), new UpsertBuilder());
      const fixtureResult = await fixturePuri.transaction(
        async (fixtureTrx) => {
          const getPuriSpy = vi.spyOn(TransactionOwnerModel, "getPuri");

          try {
            let reusedResult:
              | {
                  reusedExactWrapper: boolean;
                  reusedAsNearestActive: boolean;
                  inheritedFixture: boolean;
                }
              | undefined;

            try {
              await TransactionOwnerModel.rollbackAfter(async (reusedTrx) => ({
                reusedExactWrapper: reusedTrx === outerTrx,
                reusedAsNearestActive:
                  DB.getTransactionContext().getActiveTransaction() === outerTrx,
                inheritedFixture:
                  DB.getTransactionContext().getTransaction("fixture") === fixtureTrx,
              }));
            } catch (error) {
              if (!(error instanceof ExpectedRollback)) {
                // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
                throw error;
              }
              // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
              reusedResult = error.result as typeof reusedResult;
            }

            if (!reusedResult) {
              throw new Error("재사용한 트랜잭션 결과를 확인하지 못했습니다");
            }

            return {
              ...reusedResult,
              getPuriCalls: getPuriSpy.mock.calls.length,
              fixtureRestored: DB.getTransactionContext().getActiveTransaction() === fixtureTrx,
            };
          } finally {
            getPuriSpy.mockRestore();
          }
        },
        { dbPreset: "fixture" },
      );

      return {
        ...fixtureResult,
        outerRestored: DB.getTransactionContext().getActiveTransaction() === outerTrx,
      };
    });

    expect.soft(result.reusedExactWrapper).toBe(true);
    expect.soft(result.reusedAsNearestActive).toBe(true);
    expect.soft(result.inheritedFixture).toBe(true);
    expect.soft(result.getPuriCalls).toBe(1);
    expect.soft(result.fixtureRestored).toBe(true);
    expect.soft(result.outerRestored).toBe(true);
  });

  test("같은 preset의 중첩 Puri 트랜잭션이 savepoint만 롤백하고 바깥 scope를 복원한다", async () => {
    const outerName = "SON-533 savepoint 바깥 부서";
    const innerName = "SON-533 savepoint 안쪽 부서";
    const subsequentName = "SON-533 savepoint 후속 부서";
    const savepointFailure = new Error("의도한 savepoint 롤백");

    const result = await runInRollbackTransaction(async (outerTrx) => {
      const department = await outerTrx
        .table("departments")
        .select({ id: "departments.id", name: "departments.name" })
        .orderBy("departments.id", "asc")
        .first();
      if (!department) {
        throw new Error("savepoint를 검증할 부서가 없습니다");
      }

      await outerTrx
        .table("departments")
        .where("departments.id", department.id)
        .update({ name: outerName });

      const outerContext = DB.getTransactionContext();
      let innerUsedDistinctWrapper = false;
      let innerWasNearestActive = false;
      let innerContextWasChild = false;
      let caughtSameFailure = false;

      try {
        await outerTrx.transaction(
          async (innerTrx) => {
            innerUsedDistinctWrapper = innerTrx !== outerTrx;
            innerWasNearestActive =
              DB.getTransactionContext().getActiveTransaction() === innerTrx &&
              DB.getTransactionContext().getTransaction("w") === innerTrx;
            innerContextWasChild = DB.getTransactionContext() !== outerContext;

            await innerTrx
              .table("departments")
              .where("departments.id", department.id)
              .update({ name: innerName });
            const innerVisible = await innerTrx
              .table("departments")
              .select({ name: "departments.name" })
              .where("departments.id", department.id)
              .first();
            expect(innerVisible?.name).toBe(innerName);

            throw savepointFailure;
          },
          { dbPreset: "w" },
        );
      } catch (error) {
        caughtSameFailure = error === savepointFailure;
        if (!caughtSameFailure) {
          throw error;
        }
      }

      const afterSavepointRollback = await outerTrx
        .table("departments")
        .select({ name: "departments.name" })
        .where("departments.id", department.id)
        .first();
      const outerContextRestored =
        DB.getTransactionContext() === outerContext &&
        DB.getTransactionContext().getActiveTransaction() === outerTrx &&
        DB.getTransactionContext().getTransaction("w") === outerTrx;

      await outerTrx
        .table("departments")
        .where("departments.id", department.id)
        .update({ name: subsequentName });
      const subsequentVisible = await outerTrx
        .table("departments")
        .select({ name: "departments.name" })
        .where("departments.id", department.id)
        .first();

      return {
        department,
        innerUsedDistinctWrapper,
        innerWasNearestActive,
        innerContextWasChild,
        caughtSameFailure,
        outerContextRestored,
        nameAfterSavepointRollback: afterSavepointRollback?.name,
        subsequentVisibleName: subsequentVisible?.name,
      };
    });

    expect.soft(result.innerUsedDistinctWrapper).toBe(true);
    expect.soft(result.innerWasNearestActive).toBe(true);
    expect.soft(result.innerContextWasChild).toBe(true);
    expect.soft(result.caughtSameFailure).toBe(true);
    expect.soft(result.outerContextRestored).toBe(true);
    expect.soft(result.nameAfterSavepointRollback).toBe(outerName);
    expect.soft(result.subsequentVisibleName).toBe(subsequentName);
    expect.soft(DB.getTransactionContext().getTransaction("w")).toBeUndefined();

    const persisted = await DB.getDB("test")("departments")
      .select("name")
      .where("id", result.department.id)
      .first();
    expect(persisted?.name).toBe(result.department.name);
  });

  test("같은 parent scope에서 겹쳐 실행되는 sibling 트랜잭션은 각자의 활성 범위를 유지한다", async () => {
    const firstName = "SON-533 첫 번째 sibling 부서";
    const secondName = "SON-533 두 번째 sibling 부서";
    const testPuri = new PuriWrapper(DB.getDB("test"), new UpsertBuilder());
    const fixturePuri = new PuriWrapper(DB.getDB("fixture"), new UpsertBuilder());

    const firstDepartment = await testPuri
      .table("departments")
      .select({ id: "departments.id", name: "departments.name" })
      .orderBy("departments.id", "asc")
      .first();
    const secondDepartment = await fixturePuri
      .table("departments")
      .select({ id: "departments.id", name: "departments.name" })
      .orderBy("departments.id", "asc")
      .first();
    if (!firstDepartment || !secondDepartment) {
      throw new Error("sibling 트랜잭션을 검증할 부서가 없습니다");
    }

    const firstReady = createDeferred();
    const secondReady = createDeferred();
    const firstExited = createDeferred();

    let siblingResult:
      | {
          firstResult: {
            activeWasOwn: boolean;
            inheritedParent: boolean;
            readName: string | undefined;
            error: unknown;
          };
          secondResult: {
            activeWasOwn: boolean;
            inheritedParent: boolean;
            readName: string | undefined;
            error: unknown;
          };
          outerRestored: boolean;
        }
      | undefined;

    try {
      await testPuri.transaction(
        async (outerTrx) => {
          const firstBranch = (async () => {
            let activeWasOwn = false;
            let inheritedParent = false;
            try {
              await testPuri.transaction(
                async (firstTrx) => {
                  await firstTrx
                    .table("departments")
                    .where("departments.id", firstDepartment.id)
                    .update({ name: firstName });
                  firstReady.resolve();
                  await secondReady.promise;

                  activeWasOwn =
                    DB.getTransactionContext().getActiveTransaction() === firstTrx &&
                    DB.getTransactionContext().getTransaction("w") === firstTrx;
                  inheritedParent = DB.getTransactionContext().getTransaction("r") === outerTrx;
                  const result = await DepartmentModel.findMany("P2", {
                    id: firstDepartment.id,
                    num: 1,
                    page: 1,
                    queryMode: "list",
                  });
                  throw new ExpectedRollback(result.rows[0]?.name);
                },
                { dbPreset: "w" },
              );
            } catch (error) {
              if (error instanceof ExpectedRollback) {
                // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
                return {
                  activeWasOwn,
                  inheritedParent,
                  readName: error.result as string | undefined,
                  error: undefined,
                };
              }
              return { activeWasOwn, inheritedParent, readName: undefined, error };
            } finally {
              firstExited.resolve();
            }

            throw new Error("첫 번째 sibling 트랜잭션이 롤백되지 않았습니다");
          })();

          await firstReady.promise;
          const secondBranch = (async () => {
            let activeWasOwn = false;
            let inheritedParent = false;
            try {
              await fixturePuri.transaction(
                async (secondTrx) => {
                  await secondTrx
                    .table("departments")
                    .where("departments.id", secondDepartment.id)
                    .update({ name: secondName });
                  secondReady.resolve();
                  await firstExited.promise;

                  activeWasOwn =
                    DB.getTransactionContext().getActiveTransaction() === secondTrx &&
                    DB.getTransactionContext().getTransaction("w") === secondTrx;
                  inheritedParent = DB.getTransactionContext().getTransaction("r") === outerTrx;
                  const result = await DepartmentModel.findMany("P2", {
                    id: secondDepartment.id,
                    num: 1,
                    page: 1,
                    queryMode: "list",
                  });
                  throw new ExpectedRollback(result.rows[0]?.name);
                },
                { dbPreset: "w" },
              );
            } catch (error) {
              // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
              if (error instanceof ExpectedRollback) {
                return {
                  activeWasOwn,
                  inheritedParent,
                  // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
                  readName: error.result as string | undefined,
                  error: undefined,
                };
              }
              return { activeWasOwn, inheritedParent, readName: undefined, error };
            }

            throw new Error("두 번째 sibling 트랜잭션이 롤백되지 않았습니다");
          })();

          const [firstResult, secondResult] = await Promise.all([firstBranch, secondBranch]);
          throw new ExpectedRollback({
            firstResult,
            secondResult,
            outerRestored: DB.getTransactionContext().getActiveTransaction() === outerTrx,
          });
        },
        { dbPreset: "r" },
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      );
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) {
        throw error;
      }
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      siblingResult = error.result as typeof siblingResult;
    }

    if (!siblingResult) {
      throw new Error("sibling 트랜잭션 결과를 확인하지 못했습니다");
    }

    const { firstResult, secondResult, outerRestored } = siblingResult;

    expect.soft(firstResult.activeWasOwn).toBe(true);
    expect.soft(firstResult.inheritedParent).toBe(true);
    expect.soft(firstResult.readName).toBe(firstName);
    expect.soft(firstResult.error).toBeUndefined();
    expect.soft(secondResult.activeWasOwn).toBe(true);
    expect.soft(secondResult.inheritedParent).toBe(true);
    expect.soft(secondResult.readName).toBe(secondName);
    expect.soft(secondResult.error).toBeUndefined();
    expect.soft(outerRestored).toBe(true);
    expect.soft(DB.getTransactionContext().getActiveTransaction()).toBeUndefined();

    const [firstRolledBack, secondRolledBack] = await Promise.all([
      DB.getDB("test")("departments").select("name").where("id", firstDepartment.id).first(),
      DB.getDB("fixture")("departments").select("name").where("id", secondDepartment.id).first(),
    ]);
    expect(firstRolledBack?.name).toBe(firstDepartment.name);
    expect(secondRolledBack?.name).toBe(secondDepartment.name);
  });

  test("관계 로더와 중첩 로더가 활성 트랜잭션의 변경을 함께 조회한다", async () => {
    const updatedSalary = "123456.78";
    const updatedProjectName = "SON-533 트랜잭션 프로젝트";

    const result = await runInRollbackTransaction(async (trx) => {
      const seed = await trx
        .table({ link: "projects__employees" })
        .join({ employee: "employees" }, "link.employee_id", "employee.id")
        .where("employee.department_id", "!=", null)
        .select({
          employeeId: "employee.id",
          departmentId: "employee.department_id",
          projectId: "link.project_id",
        })
        .orderBy("link.id", "asc")
        .first();
      if (!seed || seed.departmentId === null) {
        throw new Error("관계 로더를 검증할 직원이 없습니다");
      }

      await trx
        .table("employees")
        .where("employees.id", seed.employeeId)
        .update({ salary: updatedSalary });
      await trx
        .table("projects")
        .where("projects.id", seed.projectId)
        .update({ name: updatedProjectName });

      const departmentResult = await DepartmentModel.findMany("A", {
        id: seed.departmentId,
        num: 1,
        page: 1,
        queryMode: "list",
      });
      const rootSubsetSpy = vi.spyOn(employeeSubsetQueries, "P");
      const departmentEmployeesLoaderSpy = vi.spyOn(employeeLoaderQueries.P[0], "qb");
      const nestedProjectsLoaderSpy = vi.spyOn(employeeLoaderQueries.P[0].loaders[0], "qb");
      const directProjectsLoaderSpy = vi.spyOn(employeeLoaderQueries.P[1], "qb");

      try {
        const employeeResult = await EmployeeModel.findMany("P", {
          id: seed.employeeId,
          num: 1,
          page: 1,
          queryMode: "list",
        });
        const rootWrapper = rootSubsetSpy.mock.calls.at(-1)?.[0];
        const departmentEmployeesWrapper = departmentEmployeesLoaderSpy.mock.calls.at(-1)?.[0];
        const nestedProjectsWrapper = nestedProjectsLoaderSpy.mock.calls.at(-1)?.[0];
        const directProjectsWrapper = directProjectsLoaderSpy.mock.calls.at(-1)?.[0];

        return {
          seed,
          departmentResult,
          employeeResult,
          rootUsesTransactionConnection: rootWrapper?.knex === trx.knex,
          loadersUseRootConnection:
            departmentEmployeesWrapper?.knex === rootWrapper?.knex &&
            nestedProjectsWrapper?.knex === rootWrapper?.knex &&
            directProjectsWrapper?.knex === rootWrapper?.knex,
          loadersShareDerivedWrapper:
            departmentEmployeesWrapper === nestedProjectsWrapper &&
            nestedProjectsWrapper === directProjectsWrapper &&
            directProjectsWrapper !== rootWrapper,
        };
      } finally {
        rootSubsetSpy.mockRestore();
        departmentEmployeesLoaderSpy.mockRestore();
        nestedProjectsLoaderSpy.mockRestore();
        directProjectsLoaderSpy.mockRestore();
      }
    });

    const departmentEmployee = result.departmentResult.rows[0]?.employees.find(
      ({ id }) => id === result.seed.employeeId,
    );
    const employee = result.employeeResult.rows[0];
    const directProject = employee?.projs.find(({ id }) => id === result.seed.projectId);
    const nestedProject = employee?.department?.employees
      .find(({ id }) => id === result.seed.employeeId)
      ?.projs.find(({ id }) => id === result.seed.projectId);

    expect.soft(departmentEmployee?.salary).toBe(updatedSalary);
    expect.soft(directProject?.name).toBe(updatedProjectName);
    expect.soft(nestedProject?.name).toBe(updatedProjectName);
    expect.soft(result.rootUsesTransactionConnection).toBe(true);
    expect.soft(result.loadersUseRootConnection).toBe(true);
    expect.soft(result.loadersShareDerivedWrapper).toBe(true);
  });

  test("로더 실패를 그대로 전파하고 바깥 트랜잭션을 롤백한 뒤 컨텍스트를 제거한다", async () => {
    const baseDB = DB.getDB("test");
    const originalDepartment = await baseDB("departments").select("id", "name").first();
    if (!originalDepartment) {
      throw new Error("롤백을 검증할 부서가 없습니다");
    }

    const loaderFailure = new Error("의도한 로더 실패");
    vi.spyOn(departmentLoaderQueries.A[0], "qb").mockImplementationOnce(() => {
      throw loaderFailure;
    });

    const operation = TransactionOwnerModel.rollbackAfter(async (trx) => {
      await trx
        .table("departments")
        .where("departments.id", originalDepartment.id)
        .update({ name: "SON-533 롤백 대상 부서" });

      return DepartmentModel.findMany("A", {
        id: originalDepartment.id,
        num: 1,
        page: 1,
        queryMode: "list",
      });
    });

    await expect(operation).rejects.toBe(loaderFailure);
    expect(DB.getTransactionContext().getTransaction("w")).toBeUndefined();

    const rolledBack = await baseDB("departments")
      .select("name")
      .where("id", originalDepartment.id)
      .first();
    expect(rolledBack?.name).toBe(originalDepartment.name);
  });

  test("활성 트랜잭션이 없으면 설정된 읽기 DB를 사용한다", async () => {
    expect(DB.getTransactionContext().getTransaction("w")).toBeUndefined();

    const configuredWriteDB = DB.getDB("w");
    const configuredReadTransaction = await DB.getDB("fixture").transaction();
    try {
      const department = await configuredReadTransaction("departments")
        .select("id")
        .orderBy("id", "asc")
        .first();
      if (!department) {
        throw new Error("설정된 읽기 DB를 검증할 부서가 없습니다");
      }

      const readMarker = "SON-533 설정된 읽기 DB 부서";
      await configuredReadTransaction("departments")
        .where("id", department.id)
        .update({ name: readMarker });

      const getDBSpy = vi.spyOn(DepartmentModel, "getDB").mockImplementation((preset) => {
        return preset === "r" ? configuredReadTransaction : configuredWriteDB;
      });
      try {
        const result = await DepartmentModel.findMany("P2", {
          id: department.id,
          num: 1,
          page: 1,
          queryMode: "both",
        });

        expect(result).toEqual({
          rows: [expect.objectContaining({ id: department.id, name: readMarker })],
          total: 1,
        });
        expect(getDBSpy.mock.calls.map(([preset]) => preset)).toEqual(["r"]);
      } finally {
        getDBSpy.mockRestore();
      }
    } finally {
      await configuredReadTransaction.rollback();
    }
  });
});
