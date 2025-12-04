-- PostgreSQL 덤프

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- 기존 테이블 삭제 (역순)
DROP TABLE IF EXISTS project_tags CASCADE;
DROP TABLE IF EXISTS projects__employees CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS sync_fixtures CASCADE;

-- companies
CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(255) NOT NULL,
  uuid UUID
);
CREATE UNIQUE INDEX companies_uuid_unique ON companies(uuid);

INSERT INTO companies (id, created_at, name, uuid) VALUES 
(1,'2025-11-25 00:17:02','테크놀로지 주식회사',NULL),
(2,'2025-11-25 00:17:02','글로벌 솔루션즈',NULL),
(3,'2025-11-25 00:17:02','혁신 IT 기업',NULL),
(4,'2025-11-25 00:17:02','디지털 마케팅 컴퍼니',NULL),
(5,'2025-11-25 00:17:02','소프트웨어 개발 회사',NULL);
SELECT setval('companies_id_seq', 76);

-- departments
CREATE TABLE departments (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(128) NOT NULL,
  company_id INTEGER NOT NULL,
  parent_id INTEGER,
  uuid UUID
);
CREATE UNIQUE INDEX departments_uuid_unique ON departments(uuid);

ALTER TABLE departments ADD CONSTRAINT departments_company_id_foreign 
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE departments ADD CONSTRAINT departments_parent_id_foreign 
  FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO departments (id, created_at, name, company_id, parent_id, uuid) VALUES 
(1,'2024-01-01 01:00:00','개발팀',1,NULL,NULL),
(2,'2024-01-01 02:00:00','디자인팀',1,NULL,NULL),
(3,'2024-01-02 01:00:00','백엔드팀',1,1,NULL),
(4,'2024-01-02 02:00:00','프론트엔드팀',1,1,NULL),
(5,'2024-01-03 01:00:00','기술팀',2,NULL,NULL),
(6,'2024-01-03 02:00:00','마케팅팀',2,NULL,NULL),
(7,'2024-01-04 01:00:00','연구개발팀',3,NULL,NULL),
(8,'2024-01-04 02:00:00','품질관리팀',3,NULL,NULL),
(9,'2024-01-05 01:00:00','데이터팀',4,NULL,NULL),
(10,'2024-01-06 01:00:00','아키텍처팀',5,NULL,NULL),
(11,'2024-01-06 02:00:00','인프라팀',5,NULL,NULL),
(12,'2024-01-07 01:00:00','빈부서A',1,NULL,NULL),
(13,'2024-01-07 02:00:00','빈부서B',2,NULL,NULL);
SELECT setval('departments_id_seq', 14);

-- users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  birth_date DATE,
  role VARCHAR(30) NOT NULL,
  last_login_at TIMESTAMPTZ,
  bio TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  uuid UUID
);
CREATE UNIQUE INDEX users_email_unique ON users(email);
CREATE UNIQUE INDEX users_uuid_unique ON users(uuid);

INSERT INTO users (id, created_at, email, username, password, birth_date, role, last_login_at, bio, is_verified, deleted_at, uuid) VALUES 
(1,'2024-01-01 01:00:00','kim@tech.com','김철수','password123','1990-03-15','normal','2024-01-15 09:30:00','백엔드 개발을 담당하고 있습니다.',TRUE,NULL,NULL),
(2,'2024-01-02 01:00:00','lee@global.com','이영희','password123','1988-07-22','normal','2024-01-14 14:20:00','UI/UX 디자인 전문가입니다.',TRUE,NULL,NULL),
(3,'2024-01-03 01:00:00','park@innovation.com','박민수','password123','1992-11-09','normal','2024-01-13 11:45:00','프론트엔드 개발자로 일하고 있습니다.',TRUE,NULL,NULL),
(4,'2024-01-04 01:00:00','choi@digital.com','최지훈','password123','1985-05-30','normal','2024-01-12 16:15:00','데이터 분석 및 마케팅 업무를 담당합니다.',TRUE,NULL,NULL),
(5,'2024-01-05 01:00:00','jung@software.com','정수연','password123','1993-09-14','normal','2024-01-11 10:00:00','소프트웨어 아키텍트입니다.',TRUE,NULL,NULL),
(6,'2024-01-06 01:00:00','yoon@tech.com','윤대성','password123','1987-12-03','normal','2024-01-10 13:25:00','데브옵스 엔지니어로 근무하고 있습니다.',FALSE,NULL,NULL),
(7,'2024-01-07 01:00:00','han@global.com','한미경','password123','1991-04-18','normal','2024-01-09 15:40:00','프로젝트 매니저 역할을 하고 있습니다.',FALSE,NULL,NULL),
(8,'2024-01-08 01:00:00','kang@innovation.com','강태우','password123','1989-08-25','normal','2024-01-08 08:50:00','풀스택 개발자입니다.',FALSE,NULL,NULL),
(9,'2024-01-09 01:00:00','admin@test.com','관리자','$2b$10$ZwmVndKfTm121TrW6dZQA..eW9xv.NCwEa3fEn/xqWG948O2ADKL2','1980-01-01','admin','2024-01-07 07:00:00','시스템 관리자입니다.',TRUE,NULL,NULL),
(10,'2024-01-10 01:00:00','null1@test.com','널테스터1','password123',NULL,'normal',NULL,NULL,FALSE,NULL,NULL),
(11,'2024-01-11 01:00:00','null2@test.com','널테스터2','password123',NULL,'normal',NULL,NULL,FALSE,NULL,NULL),
(12,'2023-11-01 01:00:00','deleted@test.com','탈퇴유저','password123','1992-03-10','normal','2023-12-20 10:00:00','탈퇴한 사용자입니다.',FALSE,'2024-01-01 10:00:00',NULL);
SELECT setval('users_id_seq', 736);

-- employees
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL,
  department_id INTEGER,
  employee_number VARCHAR(32) NOT NULL,
  salary NUMERIC(10,2),
  hire_date DATE,
  notes TEXT,
  uuid UUID
);
CREATE UNIQUE INDEX employees_employee_number_user_id_unique ON employees(employee_number, user_id);
CREATE UNIQUE INDEX employees_uuid_unique ON employees(uuid);

ALTER TABLE employees ADD CONSTRAINT employees_department_id_foreign 
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE employees ADD CONSTRAINT employees_user_id_foreign 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO employees (id, created_at, user_id, department_id, employee_number, salary, hire_date, notes, uuid) VALUES 
(1,'2024-01-01 01:00:00',1,3,'EMP001',75000.00,'2020-03-01','백엔드 리드 개발자',NULL),
(2,'2024-01-02 01:00:00',2,2,'EMP002',65000.00,'2019-07-15','UI/UX 디자이너',NULL),
(3,'2024-01-03 01:00:00',3,4,'EMP003',70000.00,'2021-01-10','프론트엔드 개발자',NULL),
(4,'2024-01-04 01:00:00',4,9,'EMP004',60000.00,'2022-05-20',NULL,NULL),
(5,'2024-01-05 01:00:00',5,10,'EMP005',85000.00,'2018-09-01','시니어 아키텍트',NULL),
(6,'2024-01-06 01:00:00',6,11,'EMP006',72000.00,'2020-11-15','데브옵스 엔지니어',NULL),
(7,'2024-01-07 01:00:00',7,6,'EMP007',68000.00,'2021-03-20',NULL,NULL),
(8,'2024-01-08 01:00:00',8,5,'EMP008',78000.00,'2019-12-01','풀스택 개발자',NULL),
(9,'2024-01-09 01:00:00',9,1,'EMP009',95000.00,'2015-01-01','시스템 관리자',NULL),
(10,'2024-01-10 01:00:00',10,7,'EMP010',55000.00,NULL,NULL,NULL),
(11,'2024-01-11 01:00:00',11,8,'EMP011',58000.00,NULL,NULL,NULL);
SELECT setval('employees_id_seq', 12);

-- files
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mime_type VARCHAR(128) NOT NULL,
  name VARCHAR(128) NOT NULL,
  url VARCHAR(255) NOT NULL,
  uuid UUID
);
CREATE UNIQUE INDEX files_url_unique ON files(url);
CREATE UNIQUE INDEX files_uuid_unique ON files(uuid);

-- projects
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  description TEXT,
  budget NUMERIC(12,2),
  deadline TIMESTAMPTZ,
  image_urls JSONB,
  uuid UUID
);
CREATE UNIQUE INDEX projects_uuid_unique ON projects(uuid);

INSERT INTO projects (id, created_at, name, status, description, budget, deadline, image_urls, uuid) VALUES 
(1,'2024-01-01 01:00:00','웹 애플리케이션 리뉴얼','in_progress','기존 웹사이트를 최신 기술스택으로 리뉴얼하는 프로젝트입니다.',150000.00,'2024-06-30 23:59:59',NULL,NULL),
(2,'2024-01-02 01:00:00','모바일 앱 개발','planning','새로운 모바일 서비스를 위한 앱 개발 프로젝트입니다.',200000.00,'2024-08-31 23:59:59',NULL,NULL),
(3,'2023-11-01 01:00:00','데이터 분석 시스템','completed','고객 데이터 분석을 위한 대시보드 시스템 구축 프로젝트입니다.',80000.00,'2024-03-31 23:59:59',NULL,NULL),
(4,'2024-01-03 01:00:00','API 서버 마이그레이션','in_progress','레거시 API 서버를 클라우드로 마이그레이션하는 작업입니다.',120000.00,'2024-05-31 23:59:59',NULL,NULL),
(5,'2024-01-05 01:00:00','UI/UX 개선','planning','사용자 경험 향상을 위한 인터페이스 개선 프로젝트입니다.',NULL,NULL,NULL,NULL),
(6,'2023-12-01 01:00:00','보안 강화','cancelled','시스템 보안성 강화를 위한 프로젝트였으나 우선순위 변경으로 취소되었습니다.',50000.00,NULL,NULL,NULL),
(7,'2024-01-08 01:00:00','레거시 시스템 개선','in_progress','오래된 시스템을 현대화하는 프로젝트입니다.',180000.00,'2024-12-31 23:59:59',NULL,NULL),
(8,'2023-10-01 01:00:00','내부 도구 개발','completed','직원들의 생산성 향상을 위한 내부 도구입니다.',NULL,NULL,NULL,NULL);
SELECT setval('projects_id_seq', 9);

-- tags
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(30) NOT NULL,
  uuid UUID
);
CREATE UNIQUE INDEX tags_uuid_unique ON tags(uuid);

INSERT INTO tags (id, created_at, name, uuid) VALUES 
(1,'2025-11-25 00:17:02','웹',NULL),
(2,'2025-11-25 00:17:02','모바일',NULL),
(3,'2025-11-25 00:17:02','백엔드',NULL),
(4,'2025-11-25 00:17:02','프론트엔드',NULL),
(5,'2025-11-25 00:17:02','데이터',NULL),
(6,'2025-11-25 00:17:02','인프라',NULL),
(7,'2025-11-25 00:17:02','보안',NULL),
(8,'2025-11-25 00:17:02','UI/UX',NULL);
SELECT setval('tags_id_seq', 9);

-- projects__employees
CREATE TABLE projects__employees (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  uuid UUID
);
CREATE UNIQUE INDEX projects__employees_uuid_unique ON projects__employees(uuid);

ALTER TABLE projects__employees ADD CONSTRAINT projects__employees_employee_id_foreign 
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE projects__employees ADD CONSTRAINT projects__employees_project_id_foreign 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO projects__employees (id, employee_id, project_id, uuid) VALUES 
(1,1,1,NULL),(2,2,1,NULL),(3,3,1,NULL),(4,6,1,NULL),(5,3,2,NULL),
(6,4,2,NULL),(7,8,2,NULL),(8,4,3,NULL),(9,7,3,NULL),(10,1,4,NULL),
(11,5,4,NULL),(12,6,4,NULL),(13,7,4,NULL),(14,8,4,NULL),(15,2,5,NULL),
(16,3,5,NULL),(17,5,6,NULL),(18,8,6,NULL),(19,1,7,NULL),(20,7,8,NULL);
SELECT setval('projects__employees_id_seq', 21);

-- project_tags
CREATE TABLE project_tags (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  uuid UUID
);
CREATE UNIQUE INDEX project_tags_uuid_unique ON project_tags(uuid);

ALTER TABLE project_tags ADD CONSTRAINT project_tags_project_id_foreign 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE project_tags ADD CONSTRAINT project_tags_tag_id_foreign 
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO project_tags (id, project_id, tag_id, uuid) VALUES 
(1,1,1,NULL),(2,1,3,NULL),(3,1,4,NULL),(4,2,2,NULL),(5,2,4,NULL),
(6,3,5,NULL),(7,3,3,NULL),(8,4,3,NULL),(9,4,6,NULL),(10,4,7,NULL),
(11,5,8,NULL),(12,5,4,NULL),(13,6,7,NULL),(14,7,3,NULL),(15,7,6,NULL);
SELECT setval('project_tags_id_seq', 16);

-- sync_fixtures
CREATE TABLE sync_fixtures (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ,
  name VARCHAR(128) NOT NULL,
  code VARCHAR(32),
  status VARCHAR(32) NOT NULL,
  priority INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  tags JSONB,
  uuid UUID
);
CREATE UNIQUE INDEX sync_fixtures_uuid_unique ON sync_fixtures(uuid);