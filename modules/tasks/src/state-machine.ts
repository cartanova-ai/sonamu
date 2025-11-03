export type TaskItemState = 'stopped' | 'idle' | 'running' | 'destroyed';

const allowedTransitions: Record<TaskItemState, TaskItemState[]> = {
  'stopped': ['idle', 'destroyed'],
  'idle': ['idle', 'running', 'destroyed'],
  'running': ['running', 'idle', 'destroyed'],
  'destroyed': ['destroyed']
}

export class TaskItemStateMachine {
  #state: TaskItemState;

  constructor(initial: TaskItemState = 'stopped'){
    this.#state = initial;
  }

  get state (): TaskItemState {
    return this.#state;
  }

  changeState(state: TaskItemState){
    if (allowedTransitions[this.state].includes(state)) {
      this.#state = state;
    } else {
      throw new Error(`Invalid state transition: ${this.#state} to ${state}`);
    }
  }
}
