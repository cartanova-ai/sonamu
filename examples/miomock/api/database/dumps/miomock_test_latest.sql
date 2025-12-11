--
-- PostgreSQL database dump
--

\restrict HcDcexNJLXu61dv9bCg9f5emDBzCtMHF5pchICaRETYPgB6OCnDMI6aGlzhehXf

-- Dumped from database version 18.1 (Debian 18.1-1.pgdg13+2)
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name text NOT NULL
);


--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(128) NOT NULL,
    company_id integer NOT NULL,
    parent_id integer,
    code character varying(10) GENERATED ALWAYS AS (('DEP-'::text || lpad((id)::text, 3, '0'::text))) STORED NOT NULL
);


--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id integer NOT NULL,
    department_id integer,
    employee_number character varying(32) NOT NULL,
    salary numeric(10,2),
    hire_date timestamp with time zone,
    notes text
);


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    mime_type character varying(128) NOT NULL,
    name character varying(128) NOT NULL,
    url character varying(255) NOT NULL
);


--
-- Name: files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.files_id_seq OWNED BY public.files.id;


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: project_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_tags (
    id integer NOT NULL,
    project_id integer NOT NULL,
    tag_id integer NOT NULL
);


--
-- Name: project_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_tags_id_seq OWNED BY public.project_tags.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(255) NOT NULL,
    status text NOT NULL,
    description text,
    budget numeric(12,2),
    deadline timestamp with time zone,
    image_urls text[]
);


--
-- Name: projects__employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects__employees (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    project_id integer NOT NULL
);


--
-- Name: projects__employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects__employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects__employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects__employees_id_seq OWNED BY public.projects__employees.id;


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: sync_fixtures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_fixtures (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone,
    name character varying(128) NOT NULL,
    code character varying(32),
    status text NOT NULL,
    priority integer,
    is_active boolean DEFAULT false NOT NULL,
    description text,
    tags jsonb
);


--
-- Name: sync_fixtures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sync_fixtures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sync_fixtures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sync_fixtures_id_seq OWNED BY public.sync_fixtures.id;


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name text NOT NULL
);


--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tags_id_seq OWNED BY public.tags.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    email character varying(255) NOT NULL,
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    birth_date timestamp with time zone,
    role text NOT NULL,
    last_login_at timestamp with time zone,
    bio text,
    is_verified boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: files id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files ALTER COLUMN id SET DEFAULT nextval('public.files_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: project_tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tags ALTER COLUMN id SET DEFAULT nextval('public.project_tags_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: projects__employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects__employees ALTER COLUMN id SET DEFAULT nextval('public.projects__employees_id_seq'::regclass);


--
-- Name: sync_fixtures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_fixtures ALTER COLUMN id SET DEFAULT nextval('public.sync_fixtures_id_seq'::regclass);


--
-- Name: tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags ALTER COLUMN id SET DEFAULT nextval('public.tags_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.companies VALUES (1, '2025-11-25 00:17:02+09', '테크놀로지 주식회사');
INSERT INTO public.companies VALUES (2, '2025-11-25 00:17:02+09', '글로벌 솔루션즈');
INSERT INTO public.companies VALUES (3, '2025-11-25 00:17:02+09', '혁신 IT 기업');
INSERT INTO public.companies VALUES (4, '2025-11-25 00:17:02+09', '디지털 마케팅 컴퍼니');
INSERT INTO public.companies VALUES (5, '2025-11-25 00:17:02+09', '소프트웨어 개발 회사');


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.departments VALUES (1, '2024-01-01 01:00:00+09', '개발팀', 1, NULL, DEFAULT);
INSERT INTO public.departments VALUES (2, '2024-01-01 02:00:00+09', '디자인팀', 1, NULL, DEFAULT);
INSERT INTO public.departments VALUES (3, '2024-01-02 01:00:00+09', '백엔드팀', 1, 1, DEFAULT);
INSERT INTO public.departments VALUES (4, '2024-01-02 02:00:00+09', '프론트엔드팀', 1, 1, DEFAULT);
INSERT INTO public.departments VALUES (5, '2024-01-03 01:00:00+09', '기술팀', 2, NULL, DEFAULT);
INSERT INTO public.departments VALUES (6, '2024-01-03 02:00:00+09', '마케팅팀', 2, NULL, DEFAULT);
INSERT INTO public.departments VALUES (7, '2024-01-04 01:00:00+09', '연구개발팀', 3, NULL, DEFAULT);
INSERT INTO public.departments VALUES (8, '2024-01-04 02:00:00+09', '품질관리팀', 3, NULL, DEFAULT);
INSERT INTO public.departments VALUES (9, '2024-01-05 01:00:00+09', '데이터팀', 4, NULL, DEFAULT);
INSERT INTO public.departments VALUES (10, '2024-01-06 01:00:00+09', '아키텍처팀', 5, NULL, DEFAULT);
INSERT INTO public.departments VALUES (11, '2024-01-06 02:00:00+09', '인프라팀', 5, NULL, DEFAULT);
INSERT INTO public.departments VALUES (12, '2024-01-07 01:00:00+09', '빈부서A', 1, NULL, DEFAULT);
INSERT INTO public.departments VALUES (13, '2024-01-07 02:00:00+09', '빈부서B', 2, NULL, DEFAULT);


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.employees VALUES (1, '2024-01-01 01:00:00+09', 1, 3, 'EMP001', 75000.00, '2020-03-01 00:00:00+09', '백엔드 리드 개발자');
INSERT INTO public.employees VALUES (2, '2024-01-02 01:00:00+09', 2, 2, 'EMP002', 65000.00, '2019-07-15 00:00:00+09', 'UI/UX 디자이너');
INSERT INTO public.employees VALUES (3, '2024-01-03 01:00:00+09', 3, 4, 'EMP003', 70000.00, '2021-01-10 00:00:00+09', '프론트엔드 개발자');
INSERT INTO public.employees VALUES (4, '2024-01-04 01:00:00+09', 4, 9, 'EMP004', 60000.00, '2022-05-20 00:00:00+09', NULL);
INSERT INTO public.employees VALUES (5, '2024-01-05 01:00:00+09', 5, 10, 'EMP005', 85000.00, '2018-09-01 00:00:00+09', '시니어 아키텍트');
INSERT INTO public.employees VALUES (6, '2024-01-06 01:00:00+09', 6, 11, 'EMP006', 72000.00, '2020-11-15 00:00:00+09', '데브옵스 엔지니어');
INSERT INTO public.employees VALUES (7, '2024-01-07 01:00:00+09', 7, 6, 'EMP007', 68000.00, '2021-03-20 00:00:00+09', NULL);
INSERT INTO public.employees VALUES (8, '2024-01-08 01:00:00+09', 8, 5, 'EMP008', 78000.00, '2019-12-01 00:00:00+09', '풀스택 개발자');
INSERT INTO public.employees VALUES (9, '2024-01-09 01:00:00+09', 9, 1, 'EMP009', 95000.00, '2015-01-01 00:00:00+09', '시스템 관리자');
INSERT INTO public.employees VALUES (10, '2024-01-10 01:00:00+09', 10, 7, 'EMP010', 55000.00, NULL, NULL);
INSERT INTO public.employees VALUES (11, '2024-01-11 01:00:00+09', 11, 8, 'EMP011', 58000.00, NULL, NULL);


--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: knex_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.knex_migrations VALUES (29, '20251209160740_create__companies.ts', 1, '2025-12-09 16:25:57.198+09');
INSERT INTO public.knex_migrations VALUES (30, '20251209160741_create__departments.ts', 1, '2025-12-09 16:25:57.2+09');
INSERT INTO public.knex_migrations VALUES (31, '20251209160742_create__employees.ts', 1, '2025-12-09 16:25:57.203+09');
INSERT INTO public.knex_migrations VALUES (32, '20251209160743_create__files.ts', 1, '2025-12-09 16:25:57.205+09');
INSERT INTO public.knex_migrations VALUES (33, '20251209160744_create__projects.ts', 1, '2025-12-09 16:25:57.207+09');
INSERT INTO public.knex_migrations VALUES (34, '20251209160745_create__sync_fixtures.ts', 1, '2025-12-09 16:25:57.209+09');
INSERT INTO public.knex_migrations VALUES (35, '20251209160746_create__tags.ts', 1, '2025-12-09 16:25:57.211+09');
INSERT INTO public.knex_migrations VALUES (36, '20251209160747_create__users.ts', 1, '2025-12-09 16:25:57.214+09');
INSERT INTO public.knex_migrations VALUES (37, '20251209160748_create__projects__employees.ts', 1, '2025-12-09 16:25:57.215+09');
INSERT INTO public.knex_migrations VALUES (38, '20251209160749_create__project_tags.ts', 1, '2025-12-09 16:25:57.217+09');
INSERT INTO public.knex_migrations VALUES (39, '20251209160750_foreign__departments__company_id_parent_id.ts', 1, '2025-12-09 16:25:57.219+09');
INSERT INTO public.knex_migrations VALUES (40, '20251209160751_foreign__employees__user_id_department_id.ts', 1, '2025-12-09 16:25:57.22+09');
INSERT INTO public.knex_migrations VALUES (41, '20251209160752_foreign__projects__employees__employee_id_project_id.ts', 1, '2025-12-09 16:25:57.222+09');
INSERT INTO public.knex_migrations VALUES (42, '20251209160753_foreign__project_tags__project_id_tag_id.ts', 1, '2025-12-09 16:25:57.224+09');
INSERT INTO public.knex_migrations VALUES (49, '20251211150026_alter_departments_add1.ts', 2, '2025-12-11 16:01:46.752+09');


--
-- Data for Name: knex_migrations_lock; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.knex_migrations_lock VALUES (1, 0);


--
-- Data for Name: project_tags; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.project_tags VALUES (1, 1, 1);
INSERT INTO public.project_tags VALUES (2, 1, 3);
INSERT INTO public.project_tags VALUES (3, 1, 4);
INSERT INTO public.project_tags VALUES (4, 2, 2);
INSERT INTO public.project_tags VALUES (5, 2, 4);
INSERT INTO public.project_tags VALUES (6, 3, 5);
INSERT INTO public.project_tags VALUES (7, 3, 3);
INSERT INTO public.project_tags VALUES (8, 4, 3);
INSERT INTO public.project_tags VALUES (9, 4, 6);
INSERT INTO public.project_tags VALUES (10, 4, 7);
INSERT INTO public.project_tags VALUES (11, 5, 8);
INSERT INTO public.project_tags VALUES (12, 5, 4);
INSERT INTO public.project_tags VALUES (13, 6, 7);
INSERT INTO public.project_tags VALUES (14, 7, 3);
INSERT INTO public.project_tags VALUES (15, 7, 6);


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.projects VALUES (1, '2024-01-01 01:00:00+09', '웹 애플리케이션 리뉴얼', 'in_progress', '기존 웹사이트를 최신 기술스택으로 리뉴얼하는 프로젝트입니다.', 150000.00, '2024-06-30 23:59:59+09', NULL);
INSERT INTO public.projects VALUES (2, '2024-01-02 01:00:00+09', '모바일 앱 개발', 'planning', '새로운 모바일 서비스를 위한 앱 개발 프로젝트입니다.', 200000.00, '2024-08-31 23:59:59+09', NULL);
INSERT INTO public.projects VALUES (3, '2023-11-01 01:00:00+09', '데이터 분석 시스템', 'completed', '고객 데이터 분석을 위한 대시보드 시스템 구축 프로젝트입니다.', 80000.00, '2024-03-31 23:59:59+09', NULL);
INSERT INTO public.projects VALUES (4, '2024-01-03 01:00:00+09', 'API 서버 마이그레이션', 'in_progress', '레거시 API 서버를 클라우드로 마이그레이션하는 작업입니다.', 120000.00, '2024-05-31 23:59:59+09', NULL);
INSERT INTO public.projects VALUES (5, '2024-01-05 01:00:00+09', 'UI/UX 개선', 'planning', '사용자 경험 향상을 위한 인터페이스 개선 프로젝트입니다.', NULL, NULL, NULL);
INSERT INTO public.projects VALUES (6, '2023-12-01 01:00:00+09', '보안 강화', 'cancelled', '시스템 보안성 강화를 위한 프로젝트였으나 우선순위 변경으로 취소되었습니다.', 50000.00, NULL, NULL);
INSERT INTO public.projects VALUES (7, '2024-01-08 01:00:00+09', '레거시 시스템 개선', 'in_progress', '오래된 시스템을 현대화하는 프로젝트입니다.', 180000.00, '2024-12-31 23:59:59+09', NULL);
INSERT INTO public.projects VALUES (8, '2023-10-01 01:00:00+09', '내부 도구 개발', 'completed', '직원들의 생산성 향상을 위한 내부 도구입니다.', NULL, NULL, NULL);


--
-- Data for Name: projects__employees; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.projects__employees VALUES (1, 1, 1);
INSERT INTO public.projects__employees VALUES (2, 2, 1);
INSERT INTO public.projects__employees VALUES (3, 3, 1);
INSERT INTO public.projects__employees VALUES (4, 6, 1);
INSERT INTO public.projects__employees VALUES (5, 3, 2);
INSERT INTO public.projects__employees VALUES (6, 4, 2);
INSERT INTO public.projects__employees VALUES (7, 8, 2);
INSERT INTO public.projects__employees VALUES (8, 4, 3);
INSERT INTO public.projects__employees VALUES (9, 7, 3);
INSERT INTO public.projects__employees VALUES (10, 1, 4);
INSERT INTO public.projects__employees VALUES (11, 5, 4);
INSERT INTO public.projects__employees VALUES (12, 6, 4);
INSERT INTO public.projects__employees VALUES (13, 7, 4);
INSERT INTO public.projects__employees VALUES (14, 8, 4);
INSERT INTO public.projects__employees VALUES (15, 2, 5);
INSERT INTO public.projects__employees VALUES (16, 3, 5);
INSERT INTO public.projects__employees VALUES (17, 5, 6);
INSERT INTO public.projects__employees VALUES (18, 8, 6);
INSERT INTO public.projects__employees VALUES (19, 1, 7);
INSERT INTO public.projects__employees VALUES (20, 7, 8);


--
-- Data for Name: sync_fixtures; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tags VALUES (1, '2025-11-25 00:17:02+09', '웹');
INSERT INTO public.tags VALUES (2, '2025-11-25 00:17:02+09', '모바일');
INSERT INTO public.tags VALUES (3, '2025-11-25 00:17:02+09', '백엔드');
INSERT INTO public.tags VALUES (4, '2025-11-25 00:17:02+09', '프론트엔드');
INSERT INTO public.tags VALUES (5, '2025-11-25 00:17:02+09', '데이터');
INSERT INTO public.tags VALUES (6, '2025-11-25 00:17:02+09', '인프라');
INSERT INTO public.tags VALUES (7, '2025-11-25 00:17:02+09', '보안');
INSERT INTO public.tags VALUES (8, '2025-11-25 00:17:02+09', 'UI/UX');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users VALUES (1, '2024-01-01 01:00:00+09', 'kim@tech.com', '김철수', 'password123', '1990-03-15 00:00:00+09', 'normal', '2024-01-15 09:30:00+09', '백엔드 개발을 담당하고 있습니다.', true, NULL);
INSERT INTO public.users VALUES (2, '2024-01-02 01:00:00+09', 'lee@global.com', '이영희', 'password123', '1988-07-22 00:00:00+10', 'normal', '2024-01-14 14:20:00+09', 'UI/UX 디자인 전문가입니다.', true, NULL);
INSERT INTO public.users VALUES (3, '2024-01-03 01:00:00+09', 'park@innovation.com', '박민수', 'password123', '1992-11-09 00:00:00+09', 'normal', '2024-01-13 11:45:00+09', '프론트엔드 개발자로 일하고 있습니다.', true, NULL);
INSERT INTO public.users VALUES (4, '2024-01-04 01:00:00+09', 'choi@digital.com', '최지훈', 'password123', '1985-05-30 00:00:00+09', 'normal', '2024-01-12 16:15:00+09', '데이터 분석 및 마케팅 업무를 담당합니다.', true, NULL);
INSERT INTO public.users VALUES (5, '2024-01-05 01:00:00+09', 'jung@software.com', '정수연', 'password123', '1993-09-14 00:00:00+09', 'normal', '2024-01-11 10:00:00+09', '소프트웨어 아키텍트입니다.', true, NULL);
INSERT INTO public.users VALUES (6, '2024-01-06 01:00:00+09', 'yoon@tech.com', '윤대성', 'password123', '1987-12-03 00:00:00+09', 'normal', '2024-01-10 13:25:00+09', '데브옵스 엔지니어로 근무하고 있습니다.', false, NULL);
INSERT INTO public.users VALUES (7, '2024-01-07 01:00:00+09', 'han@global.com', '한미경', 'password123', '1991-04-18 00:00:00+09', 'normal', '2024-01-09 15:40:00+09', '프로젝트 매니저 역할을 하고 있습니다.', false, NULL);
INSERT INTO public.users VALUES (8, '2024-01-08 01:00:00+09', 'kang@innovation.com', '강태우', 'password123', '1989-08-25 00:00:00+09', 'normal', '2024-01-08 08:50:00+09', '풀스택 개발자입니다.', false, NULL);
INSERT INTO public.users VALUES (9, '2024-01-09 01:00:00+09', 'admin@test.com', '관리자', '$2b$10$ZwmVndKfTm121TrW6dZQA..eW9xv.NCwEa3fEn/xqWG948O2ADKL2', '1980-01-01 00:00:00+09', 'admin', '2024-01-07 07:00:00+09', '시스템 관리자입니다.', true, NULL);
INSERT INTO public.users VALUES (10, '2024-01-10 01:00:00+09', 'null1@test.com', '널테스터1', 'password123', NULL, 'normal', NULL, NULL, false, NULL);
INSERT INTO public.users VALUES (11, '2024-01-11 01:00:00+09', 'null2@test.com', '널테스터2', 'password123', NULL, 'normal', NULL, NULL, false, NULL);
INSERT INTO public.users VALUES (12, '2023-11-01 01:00:00+09', 'deleted@test.com', '탈퇴유저', 'password123', '1992-03-10 00:00:00+09', 'normal', '2023-12-20 10:00:00+09', '탈퇴한 사용자입니다.', false, '2024-01-01 10:00:00+09');


--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.companies_id_seq', 299, true);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.departments_id_seq', 766, true);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_id_seq', 640, true);


--
-- Name: files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.files_id_seq', 1, false);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.knex_migrations_id_seq', 49, true);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.knex_migrations_lock_index_seq', 1, true);


--
-- Name: project_tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.project_tags_id_seq', 15, true);


--
-- Name: projects__employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.projects__employees_id_seq', 20, true);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.projects_id_seq', 8, true);


--
-- Name: sync_fixtures_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sync_fixtures_id_seq', 1, false);


--
-- Name: tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tags_id_seq', 8, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 2291, true);


--
-- Name: companies companies_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_name_unique UNIQUE (name);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: departments departments_company_id_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_company_id_name_unique UNIQUE (company_id, name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees employees_user_id_employee_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_employee_number_unique UNIQUE (user_id, employee_number);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: files files_url_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_url_unique UNIQUE (url);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: project_tags project_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tags
    ADD CONSTRAINT project_tags_pkey PRIMARY KEY (id);


--
-- Name: projects__employees projects__employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects__employees
    ADD CONSTRAINT projects__employees_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: sync_fixtures sync_fixtures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_fixtures
    ADD CONSTRAINT sync_fixtures_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: departments departments_company_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_company_id_foreign FOREIGN KEY (company_id) REFERENCES public.companies(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: departments departments_parent_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: employees employees_department_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_department_id_foreign FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: employees employees_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_tags project_tags_project_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tags
    ADD CONSTRAINT project_tags_project_id_foreign FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_tags project_tags_tag_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tags
    ADD CONSTRAINT project_tags_tag_id_foreign FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: projects__employees projects__employees_employee_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects__employees
    ADD CONSTRAINT projects__employees_employee_id_foreign FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: projects__employees projects__employees_project_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects__employees
    ADD CONSTRAINT projects__employees_project_id_foreign FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict HcDcexNJLXu61dv9bCg9f5emDBzCtMHF5pchICaRETYPgB6OCnDMI6aGlzhehXf

