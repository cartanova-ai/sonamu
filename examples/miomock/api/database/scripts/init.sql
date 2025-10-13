-- 1. 회사 데이터
INSERT INTO companies (id, name) VALUES
(1, '테크놀로지 주식회사'),
(2, '글로벌 솔루션즈'),
(3, '혁신 IT 기업'),
(4, '디지털 마케팅 컴퍼니'),
(5, '소프트웨어 개발 회사');

-- 2. 부서 데이터 (상위 부서부터)
INSERT INTO departments (id, name, company_id, parent_id) VALUES
(1, '개발팀', 1, NULL),
(2, '디자인팀', 1, NULL),
(3, '백엔드팀', 1, 1),
(4, '프론트엔드팀', 1, 1),
(5, '기술팀', 2, NULL),
(6, '마케팅팀', 2, NULL),
(7, '연구개발팀', 3, NULL),
(8, '품질관리팀', 3, NULL),
(9, '데이터팀', 4, NULL),
(10, '아키텍처팀', 5, NULL),
(11, '인프라팀', 5, NULL);

-- 3. 사용자 데이터
INSERT INTO users (id, email, username, birth_date, role, last_login_at, bio, is_verified) VALUES
(1, 'kim@tech.com', '김철수', '1990-03-15', 'normal', '2024-01-15 09:30:00', '백엔드 개발을 담당하고 있습니다.', true),
(2, 'lee@global.com', '이영희', '1988-07-22', 'normal', '2024-01-14 14:20:00', 'UI/UX 디자인 전문가입니다.', true),
(3, 'park@innovation.com', '박민수', '1992-11-09', 'normal', '2025-10-09 01:03:00', '프론트엔드 개발자로 일하고 있습니다.', false),
(4, 'choi@digital.com', '최지훈', '1985-05-30', 'normal', '2024-01-12 16:15:00', '데이터 분석 및 마케팅 업무를 담당합니다.', true),
(5, 'jung@software.com', '정수연', '1993-09-14', 'normal', '2024-01-11 10:00:00', '소프트웨어 아키텍트입니다.', true),
(6, 'yoon@tech.com', '윤대성', '1987-12-03', 'normal', '2024-01-10 13:25:00', '데브옵스 엔지니어로 근무하고 있습니다.', false),
(7, 'han@global.com', '한미경', '1991-04-18', 'normal', '2024-01-09 15:40:00', '프로젝트 매니저 역할을 하고 있습니다.', true),
(8, 'kang@innovation.com', '강태우', '1989-08-25', 'normal', '2024-01-08 08:50:00', '풀스택 개발자입니다.', true);

-- 4. 직원 데이터
INSERT INTO employees (id, user_id, department_id, employee_number, salary) VALUES
(1, 1, 3, 'EMP001', 75000.00),
(2, 2, 2, 'EMP002', 65000.00),
(3, 3, 4, 'EMP003', 70000.00),
(4, 4, 9, 'EMP004', 60000.00),
(5, 5, 10, 'EMP005', 85000.00),
(6, 6, 11, 'EMP006', 72000.00),
(7, 7, 6, 'EMP007', 68000.00),
(8, 8, 5, 'EMP008', 78000.00);

-- 5. 프로젝트 데이터
INSERT INTO projects (id, name, status, description) VALUES
(1, '웹 애플리케이션 리뉴얼', 'in_progress', '기존 웹사이트를 최신 기술스택으로 리뉴얼하는 프로젝트입니다.'),
(2, '모바일 앱 개발', 'planning', '새로운 모바일 서비스를 위한 앱 개발 프로젝트입니다.'),
(3, '데이터 분석 시스템', 'completed', '고객 데이터 분석을 위한 대시보드 시스템 구축 프로젝트입니다.'),
(4, 'API 서버 마이그레이션', 'in_progress', '레거시 API 서버를 클라우드로 마이그레이션하는 작업입니다.'),
(5, 'UI/UX 개선', 'planning', '사용자 경험 향상을 위한 인터페이스 개선 프로젝트입니다.'),
(6, '보안 강화', 'cancelled', '시스템 보안성 강화를 위한 프로젝트였으나 우선순위 변경으로 취소되었습니다.');

-- 6. 프로젝트-직원 매핑 (M:N)
INSERT INTO projects__employees (project_id, employee_id) VALUES
(6, 8),
(6, 7),
(2, 3);
