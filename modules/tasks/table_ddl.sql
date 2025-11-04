-- TaskNode에서 처리할 Task 목록
CREATE TABLE sonamu_tasks (
  id BINARY(16) PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Task의 Namespace
  namespace VARCHAR(255) NOT NULL,

  -- pending, pending_for_retry
  status VARCHAR(32) NOT NULL DEFAULT "pending",

  -- Task의 시도 횟수를 상태로 저장
  attempt INTEGER NOT NULL DEFAULT 1,

  -- payload는 JSON이든 무엇이든 일단 BLOB으로 저장
  payload MEDIUMBLOB NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TaskNode에서 처리가 끝난 Task 목록
CREATE TABLE sonamu_archived_tasks (
  id BINARY(16) PRIMARY KEY,
  created_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NOT NULL,
  namespace VARCHAR(255) NOT NULL,
  payload MEDIUMBLOB NOT NULL,

  -- Task가 몇번째 시도에 끝났는지 저장
  attempt INTEGER NOT NULL DEFAULT 1,

  -- error, completed
  status VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sonamu_task_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Event의 종류 네임스페이스
  -- start | stop | fetch | process:(start|error|complete)
  event_type VARCHAR(255) NOT NULL,

  -- TaskNode에서 자동 생성된 노드의 UUIDv7
  node_id BINARY(16) NOT NULL,
  -- 사용자가 지정한 노드 이름
  node_name VARCHAR(64),

  -- Task의 id
  task_id BINARY(16),
  -- Task의 당시 몇번째인지 기록해둠.
  task_attempt INTEGER,

  -- event_type이 stop일 때와 process:error:*일 때만 있음
  -- TaskNode Stop: app_shutdown | process_signal | unknown
  -- Process Error: no_route | serialization | timeout | max_retries_exceeded | exception
  reason VARCHAR(32),

  error_message VARCHAR(1000),
  error_stack TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
