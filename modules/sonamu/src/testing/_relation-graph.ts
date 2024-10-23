import { RelationNode, EntityProp, FixtureRecord } from "../types/types";
import { EntityManager } from "../entity/entity-manager";
import {
  isRelationProp,
  isBelongsToOneRelationProp,
  isOneToOneRelationProp,
  isManyToManyRelationProp,
} from "../types/types";

// 관계 그래프 처리를 별도 클래스로 분리
export class RelationGraph {
  private graph: Map<string, RelationNode> = new Map();

  buildGraph(fixtures: FixtureRecord[]): void {
    this.graph.clear();

    // 1. 노드 추가
    for (const fixture of fixtures) {
      this.graph.set(fixture.fixtureId, {
        fixtureId: fixture.fixtureId,
        entityId: fixture.entityId,
        related: new Set(),
      });
    }

    // 2. 의존성 추가
    for (const fixture of fixtures) {
      const node = this.graph.get(fixture.fixtureId)!;

      for (const [, column] of Object.entries(fixture.columns)) {
        const prop = column.prop as EntityProp;

        if (isRelationProp(prop)) {
          if (
            isBelongsToOneRelationProp(prop) ||
            (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
          ) {
            const relatedFixtureId = `${prop.with}#${column.value}`;
            if (this.graph.has(relatedFixtureId)) {
              node.related.add(relatedFixtureId);
            }
          } else if (isManyToManyRelationProp(prop)) {
            // ManyToMany 관계의 경우 양방향 의존성 추가
            const relatedIds = column.value as number[];
            for (const relatedId of relatedIds) {
              const relatedFixtureId = `${prop.with}#${relatedId}`;
              if (this.graph.has(relatedFixtureId)) {
                node.related.add(relatedFixtureId);
                this.graph
                  .get(relatedFixtureId)!
                  .related.add(fixture.fixtureId);
              }
            }
          }
        }
      }
    }
  }

  getInsertionOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];
    const tempVisited = new Set<string>();

    const visit = (fixtureId: string) => {
      if (visited.has(fixtureId)) return;
      if (tempVisited.has(fixtureId)) {
        console.warn(`Circular dependency detected involving: ${fixtureId}`);
        return;
      }

      tempVisited.add(fixtureId);

      const node = this.graph.get(fixtureId)!;
      const entity = EntityManager.get(node.entityId);

      for (const depId of node.related) {
        const depNode = this.graph.get(depId)!;

        // BelongsToOne 관계이면서 nullable이 아닌 경우 먼저 방문
        const relationProp = entity.props.find(
          (prop) =>
            isRelationProp(prop) &&
            (isBelongsToOneRelationProp(prop) ||
              (isOneToOneRelationProp(prop) && prop.hasJoinColumn)) &&
            prop.with === depNode.entityId
        );
        if (relationProp && !relationProp.nullable) {
          visit(depId);
        }
      }

      tempVisited.delete(fixtureId);
      visited.add(fixtureId);
      order.push(fixtureId);
    };

    for (const fixtureId of this.graph.keys()) {
      visit(fixtureId);
    }

    // circular dependency로 인해 방문되지 않은 fixtureId 추가
    for (const fixtureId of this.graph.keys()) {
      if (!visited.has(fixtureId)) {
        order.push(fixtureId);
      }
    }

    return order;
  }
}
