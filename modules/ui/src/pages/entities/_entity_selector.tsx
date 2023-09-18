import { Dropdown, Form, Header, Segment } from "semantic-ui-react";
import { useCommonModal } from "../../components/core/CommonModal";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { useRef } from "react";

type EntitySelectorProps = {};
export function EntitySelector({}: EntitySelectorProps) {
  const { data } = SonamuUIService.useEntities();
  const { entities } = data ?? {};

  const { doneModal } = useCommonModal();

  const valueRef = useRef<string | null>();

  return (
    <div className="form entity-selector">
      <Segment padded basic>
        <Segment padded color="green">
          <div className="header-row">
            <Header>Select an entity</Header>
          </div>
          <Segment basic>
            {entities && (
              <Form>
                <Form.Group widths="equal">
                  <Form.Field>
                    <Dropdown
                      search
                      selection
                      open
                      options={entities.map((entity) => ({
                        key: entity.id,
                        text: entity.id,
                        value: entity.id,
                      }))}
                      onChange={(_e, { value }) => {
                        valueRef.current = String(value);
                      }}
                      onClose={() => {
                        doneModal(valueRef.current);
                      }}
                    />
                  </Form.Field>
                </Form.Group>
              </Form>
            )}
          </Segment>
        </Segment>
      </Segment>
    </div>
  );
}
