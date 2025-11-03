-- TaskNode에서 처리할 Task 목록
CREATE TABLE sonamu_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Task의 Namespace
  namespace VARCHAR(255) NOT NULL,

  -- pending, pending_for_retry, max_retries_exceeded, error, completed
  status VARCHAR(32) NOT NULL DEFAULT "pending",

  -- Task의 재시도 횟수를 상태로 저장
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- payload는 JSON이든 무엇이든 일단 BLOB으로 저장
  payload MEDIUMBLOB NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sonamu_task_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Event의 종류 네임스페이스
  -- start | stop | fetch:(main|retry) | process:(start|error|complete):(main|retry)
  event_type VARCHAR(255) NOT NULL,

  -- TaskNode에서 자동 생성된 노드의 UUIDv7
  node_id BINARY(16) NOT NULL,
  -- 사용자가 지정한 노드 이름
  node_name VARCHAR(64),

  -- Task의 id
  task_id INT,
  -- Task의 당시 retry_count를 기록해둠.
  task_retry_count INTEGER,

  -- event_type이 stop일 때와 process:error:*일 때만 있음
  -- TaskNode Stop: app_shutdown | process_signal | unknown
  -- Process Error: no_route | serialization | timeout | max_retries_exceeded | exception
  reason VARCHAR(32),
  error VARCHAR(10000),

  FOREIGN KEY (task_id) REFERENCES sonamu_tasks(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
