import classnames from "classnames";
import { Table } from "semantic-ui-react";

type KeyValueTableProps = {
  rows: {
    key: string;
    value: JSX.Element;
    keyClassName?: string;
    valueClassName?: string;
  }[];
  keyWidth?: number;
  keyClassName?: string;
  valueClassName?: string;
};
export function KeyValueTable({
  rows,
  keyWidth,
  keyClassName,
  valueClassName,
}: KeyValueTableProps) {
  return (
    <Table celled compact className="key-value-table">
      <Table.Body>
        {rows.map(
          (
            {
              key,
              value,
              keyClassName: rowKeyClassName,
              valueClassName: rowValueClassName,
            },
            rowIndex
          ) => (
            <Table.Row key={rowIndex}>
              <Table.Cell
                className={classnames("key", keyClassName, rowKeyClassName)}
                style={{
                  width: keyWidth ?? 140,
                  fontWeight: "bold",
                }}
              >
                {key}
              </Table.Cell>
              <Table.Cell
                className={classnames(
                  "value",
                  valueClassName,
                  rowValueClassName
                )}
              >
                {value}
              </Table.Cell>
            </Table.Row>
          )
        )}
      </Table.Body>
    </Table>
  );
}
