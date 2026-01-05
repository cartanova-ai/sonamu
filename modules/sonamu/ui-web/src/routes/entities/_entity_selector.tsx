import { useRef } from "react";
import { useCommonModal } from "../../components/core/CommonModal";
import { EntityIdSelect } from "../../components/EntityIdSelect";

type EntitySelectorProps = {};
export function EntitySelector({}: EntitySelectorProps) {
  const { doneModal } = useCommonModal();

  const valueRef = useRef<string | null>(null);

  return (
    <div className="form entity-selector">
      <div className="ui padded basic segment">
        <div className="ui padded green segment">
          <div className="header-row">
            <h2 className="ui header">Select an entity</h2>
          </div>
          <div className="ui basic segment">
            <form className="ui form">
              <div className="equal width fields">
                <div className="field">
                  <EntityIdSelect
                    onValueChange={(value) => {
                      valueRef.current = value;
                      doneModal(value);
                    }}
                    search
                  />
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
