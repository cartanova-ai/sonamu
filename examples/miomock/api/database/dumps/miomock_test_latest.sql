--
-- PostgreSQL database dump
--

\restrict 31QXyO104WxKd3MUyMTZiOXFucoy33hifEbEG9uVCYOYWehPoP3KfAKmd0rPADN

-- Dumped from database version 18.1 (Debian 18.1-1.pgdg12+2)
-- Dumped by pg_dump version 18.1 (Homebrew)

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

--
-- Name: pgroonga; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgroonga WITH SCHEMA public;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp(3) with time zone,
    refresh_token_expires_at timestamp(3) with time zone,
    scope text,
    password text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone NOT NULL
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
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
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
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
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    title character varying(255) NOT NULL,
    content text,
    status text NOT NULL,
    title_content_embedding public.vector(1024)
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id text NOT NULL,
    department_id integer,
    employee_number character varying(32) NOT NULL,
    salary numeric(10,2),
    hire_date timestamp(3) with time zone,
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
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
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
-- Name: passkeys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passkeys (
    id text NOT NULL,
    name text,
    public_key text NOT NULL,
    credential_id text NOT NULL,
    counter integer NOT NULL,
    device_type text NOT NULL,
    backed_up boolean NOT NULL,
    transports text,
    aaguid text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id text NOT NULL
);


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
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying(255) NOT NULL,
    status text NOT NULL,
    description text,
    budget numeric(12,2),
    deadline timestamp(3) with time zone,
    image_urls jsonb,
    textsearchable_index_col tsvector GENERATED ALWAYS AS ((setweight(to_tsvector('simple'::regconfig, (COALESCE(name, ''::character varying))::text), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, COALESCE(description, ''::text)), 'D'::"char"))) STORED NOT NULL
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
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL
);


--
-- Name: sync_fixtures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_fixtures (
    id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone,
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
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name text NOT NULL,
    name_en character varying(30),
    name_ko character varying(30)
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
-- Name: two_factors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.two_factors (
    id text NOT NULL,
    secret text NOT NULL,
    backup_codes text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    email character varying(255) NOT NULL,
    username character varying(255) NOT NULL,
    password character varying(255),
    birth_date timestamp(3) with time zone,
    role text NOT NULL,
    last_login_at timestamp(3) with time zone,
    bio text,
    is_verified boolean DEFAULT false NOT NULL,
    deleted_at timestamp(3) with time zone,
    image text,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    two_factor_enabled boolean
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
-- Name: verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verifications (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


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

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT (nextval('public.users_id_seq'::regclass))::text;


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.companies VALUES (2, '2025-11-25 00:17:02+09', '글로벌 솔루션즈');
INSERT INTO public.companies VALUES (4, '2025-11-25 00:17:02+09', '디지털 마케팅 컴퍼니');
INSERT INTO public.companies VALUES (5, '2025-11-25 00:17:02+09', '소프트웨어 개발 회사');
INSERT INTO public.companies VALUES (3, '2025-11-25 00:17:02+09', '혁신 IT 기업');
INSERT INTO public.companies VALUES (1, '2025-11-25 00:17:02+09', '테크놀로지 주식회사');


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.departments VALUES (1, '2024-01-01 01:00:00+09', '개발팀', 1, NULL, DEFAULT);
INSERT INTO public.departments VALUES (4, '2024-01-02 02:00:00+09', '프론트엔드팀', 1, 1, DEFAULT);
INSERT INTO public.departments VALUES (5, '2024-01-03 01:00:00+09', '기술팀', 2, NULL, DEFAULT);
INSERT INTO public.departments VALUES (6, '2024-01-03 02:00:00+09', '마케팅팀', 2, NULL, DEFAULT);
INSERT INTO public.departments VALUES (7, '2024-01-04 01:00:00+09', '연구개발팀', 3, NULL, DEFAULT);
INSERT INTO public.departments VALUES (8, '2024-01-04 02:00:00+09', '품질관리팀', 3, NULL, DEFAULT);
INSERT INTO public.departments VALUES (9, '2024-01-05 01:00:00+09', '데이터팀', 4, NULL, DEFAULT);
INSERT INTO public.departments VALUES (10, '2024-01-06 01:00:00+09', '아키텍처팀', 5, NULL, DEFAULT);
INSERT INTO public.departments VALUES (12, '2024-01-07 01:00:00+09', '빈부서A', 1, NULL, DEFAULT);
INSERT INTO public.departments VALUES (13, '2024-01-07 02:00:00+09', '빈부서B', 2, NULL, DEFAULT);
INSERT INTO public.departments VALUES (2, '2024-01-01 02:00:00+09', '디자인팀', 1, NULL, DEFAULT);
INSERT INTO public.departments VALUES (11, '2024-01-06 02:00:00+09', '인프라팀', 5, NULL, DEFAULT);
INSERT INTO public.departments VALUES (3, '2024-01-02 01:00:00+09', '백엔드팀', 1, 1, DEFAULT);


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.employees VALUES (3, '2024-01-03 01:00:00+09', '3', 4, 'EMP003', 70000.00, '2021-01-10 00:00:00+09', '프론트엔드 개발자');
INSERT INTO public.employees VALUES (4, '2024-01-04 01:00:00+09', '4', 9, 'EMP004', 60000.00, '2022-05-20 00:00:00+09', NULL);
INSERT INTO public.employees VALUES (5, '2024-01-05 01:00:00+09', '5', 10, 'EMP005', 85000.00, '2018-09-01 00:00:00+09', '시니어 아키텍트');
INSERT INTO public.employees VALUES (7, '2024-01-07 01:00:00+09', '7', 6, 'EMP007', 68000.00, '2021-03-20 00:00:00+09', NULL);
INSERT INTO public.employees VALUES (8, '2024-01-08 01:00:00+09', '8', 5, 'EMP008', 78000.00, '2019-12-01 00:00:00+09', '풀스택 개발자');
INSERT INTO public.employees VALUES (9, '2024-01-09 01:00:00+09', '9', 1, 'EMP009', 95000.00, '2015-01-01 00:00:00+09', '시스템 관리자');
INSERT INTO public.employees VALUES (10, '2024-01-10 01:00:00+09', '10', 7, 'EMP010', 55000.00, NULL, NULL);
INSERT INTO public.employees VALUES (11, '2024-01-11 01:00:00+09', '11', 8, 'EMP011', 58000.00, NULL, NULL);
INSERT INTO public.employees VALUES (2, '2024-01-02 01:00:00+09', '2', 2, 'EMP002', 65000.00, '2019-07-15 00:00:00+09', 'UI/UX 디자이너');
INSERT INTO public.employees VALUES (6, '2024-01-06 01:00:00+09', '6', 11, 'EMP006', 72000.00, '2020-11-15 00:00:00+09', '데브옵스 엔지니어');
INSERT INTO public.employees VALUES (1, '2024-01-01 01:00:00+09', '1', 3, 'EMP001', 75000.00, '2020-03-01 00:00:00+09', '백엔드 리드 개발자');


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
INSERT INTO public.knex_migrations VALUES (50, '20251211183902_create__documents.ts', 3, '2025-12-12 16:59:32.064+09');
INSERT INTO public.knex_migrations VALUES (53, '20251215123723_alter_projects_add1.ts', 4, '2025-12-15 12:37:28.231+09');
INSERT INTO public.knex_migrations VALUES (54, '20251215123829_alter_projects.ts', 5, '2025-12-15 12:38:33.09+09');
INSERT INTO public.knex_migrations VALUES (55, '20251216132209_alter_projects_drop1.ts', 6, '2025-12-16 13:38:53.379+09');
INSERT INTO public.knex_migrations VALUES (56, '20251216132334_alter_projects_add1.ts', 6, '2025-12-16 13:38:53.383+09');
INSERT INTO public.knex_migrations VALUES (57, '20251216173556_alter_projects.ts', 7, '2025-12-17 12:33:05.699+09');
INSERT INTO public.knex_migrations VALUES (58, '20251217163711_alter_projects.ts', 8, '2025-12-18 11:14:15.717+09');
INSERT INTO public.knex_migrations VALUES (59, '20260107130556_alter_tags_add2.ts', 9, '2026-01-07 13:06:04.088+09');
INSERT INTO public.knex_migrations VALUES (60, '20260107170850_alter_companies_alter1.ts', 10, '2026-01-07 17:36:40.813+09');
INSERT INTO public.knex_migrations VALUES (61, '20260107170851_alter_departments_alter1.ts', 10, '2026-01-07 17:36:40.815+09');
INSERT INTO public.knex_migrations VALUES (62, '20260107170852_alter_documents_alter1.ts', 10, '2026-01-07 17:36:40.818+09');
INSERT INTO public.knex_migrations VALUES (63, '20260107170853_alter_employees_alter2.ts', 10, '2026-01-07 17:36:40.821+09');
INSERT INTO public.knex_migrations VALUES (64, '20260107170854_alter_files_alter1.ts', 10, '2026-01-07 17:36:40.824+09');
INSERT INTO public.knex_migrations VALUES (65, '20260107170855_alter_projects_alter2.ts', 10, '2026-01-07 17:36:40.919+09');
INSERT INTO public.knex_migrations VALUES (66, '20260107170856_alter_sync_fixtures_alter2.ts', 10, '2026-01-07 17:36:40.926+09');
INSERT INTO public.knex_migrations VALUES (67, '20260107170857_alter_tags_alter1.ts', 10, '2026-01-07 17:36:40.929+09');
INSERT INTO public.knex_migrations VALUES (68, '20260107170858_alter_users_alter4.ts', 10, '2026-01-07 17:36:40.941+09');
INSERT INTO public.knex_migrations VALUES (69, '20260113144233_alter_projects_alter3.ts', 11, '2026-01-13 16:43:36.411+09');
INSERT INTO public.knex_migrations VALUES (70, '20260129201943_alter_users_pk_type.ts', 12, '2026-01-29 21:45:21.814+09');
INSERT INTO public.knex_migrations VALUES (71, '20260129202012_create__accounts.ts', 12, '2026-01-29 21:45:21.817+09');
INSERT INTO public.knex_migrations VALUES (72, '20260129202013_create__sessions.ts', 12, '2026-01-29 21:45:21.819+09');
INSERT INTO public.knex_migrations VALUES (73, '20260129202014_alter_users_add2_alter5.ts', 12, '2026-01-29 21:45:21.82+09');
INSERT INTO public.knex_migrations VALUES (74, '20260129202015_create__verifications.ts', 12, '2026-01-29 21:45:21.822+09');
INSERT INTO public.knex_migrations VALUES (75, '20260129202016_foreign__accounts__user_id.ts', 12, '2026-01-29 21:45:21.823+09');
INSERT INTO public.knex_migrations VALUES (76, '20260129202017_foreign__sessions__user_id.ts', 12, '2026-01-29 21:45:21.824+09');
INSERT INTO public.knex_migrations VALUES (77, '20260203141330_create__two_factors.ts', 13, '2026-02-03 14:13:39.047+09');
INSERT INTO public.knex_migrations VALUES (79, '20260203141332_foreign__two_factors__user_id.ts', 13, '2026-02-03 14:13:39.05+09');
INSERT INTO public.knex_migrations VALUES (84, '20260204133419_create__passkeys.ts', 14, '2026-02-12 10:38:40.664+09');
INSERT INTO public.knex_migrations VALUES (85, '20260204133420_foreign__passkeys__user_id.ts', 14, '2026-02-12 10:38:40.665+09');
INSERT INTO public.knex_migrations VALUES (78, '20260203141331_alter_users_add1_alter6.ts', 13, '2026-02-03 14:13:39.049+09');


--
-- Data for Name: knex_migrations_lock; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.knex_migrations_lock VALUES (1, 0);


--
-- Data for Name: passkeys; Type: TABLE DATA; Schema: public; Owner: -
--



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

INSERT INTO public.projects VALUES (1, '2024-01-01 01:00:00+09', '웹 애플리케이션 리뉴얼', 'in_progress', '기존 웹사이트를 최신 기술스택으로 리뉴얼하는 프로젝트입니다.', 150000.00, '2024-06-30 23:59:59+09', NULL, DEFAULT);
INSERT INTO public.projects VALUES (2, '2024-01-02 01:00:00+09', '모바일 앱 개발', 'planning', '새로운 모바일 서비스를 위한 앱 개발 프로젝트입니다.', 200000.00, '2024-08-31 23:59:59+09', NULL, DEFAULT);
INSERT INTO public.projects VALUES (3, '2023-11-01 01:00:00+09', '데이터 분석 시스템', 'completed', '고객 데이터 분석을 위한 대시보드 시스템 구축 프로젝트입니다.', 80000.00, '2024-03-31 23:59:59+09', NULL, DEFAULT);
INSERT INTO public.projects VALUES (4, '2024-01-03 01:00:00+09', 'API 서버 마이그레이션', 'in_progress', '레거시 API 서버를 클라우드로 마이그레이션하는 작업입니다.', 120000.00, '2024-05-31 23:59:59+09', NULL, DEFAULT);
INSERT INTO public.projects VALUES (5, '2024-01-05 01:00:00+09', 'UI/UX 개선', 'planning', '사용자 경험 향상을 위한 인터페이스 개선 프로젝트입니다.', NULL, NULL, NULL, DEFAULT);
INSERT INTO public.projects VALUES (6, '2023-12-01 01:00:00+09', '보안 강화', 'cancelled', '시스템 보안성 강화를 위한 프로젝트였으나 우선순위 변경으로 취소되었습니다.', 50000.00, NULL, NULL, DEFAULT);
INSERT INTO public.projects VALUES (7, '2024-01-08 01:00:00+09', '레거시 시스템 개선', 'in_progress', '오래된 시스템을 현대화하는 프로젝트입니다.', 180000.00, '2024-12-31 23:59:59+09', NULL, DEFAULT);
INSERT INTO public.projects VALUES (8, '2023-10-01 01:00:00+09', '내부 도구 개발', 'completed', '직원들의 생산성 향상을 위한 내부 도구입니다.', NULL, NULL, NULL, DEFAULT);


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
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sync_fixtures; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.sync_fixtures VALUES (1, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0001', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-02-02', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (2, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0002', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-03-03', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (3, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0003', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-04-04', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (4, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0004', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-05-05', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (5, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0005', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-06-06', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (6, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0006', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-07-07', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (7, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0007', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-08-08', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (8, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0008', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-09-09', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (9, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0009', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-10-10', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (10, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0010', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-11-11', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (11, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0011', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-12-12', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (12, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0012', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-01-13', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (13, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0013', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-02-14', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (14, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0014', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-03-15', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (15, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0015', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-04-16', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (16, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0016', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-05-17', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (17, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0017', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-06-18', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (18, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0018', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-07-19', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (19, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0019', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-08-20', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (20, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0020', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-09-21', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (21, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0021', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-10-22', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (22, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0022', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-11-23', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (23, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0023', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-12-24', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (24, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0024', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-01-25', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (25, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0025', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-02-26', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (26, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0026', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-03-27', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (27, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0027', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-04-28', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (28, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0028', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-05-01', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (29, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0029', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-06-02', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (30, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0030', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-07-03', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (31, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0031', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-08-04', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (32, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0032', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-09-05', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (33, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0033', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-10-06', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (34, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0034', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-11-07', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (35, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0035', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-12-08', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (36, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0036', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-01-09', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (37, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0037', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-02-10', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (38, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0038', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-03-11', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (39, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0039', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-04-12', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (40, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0040', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-05-13', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (41, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0041', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-06-14', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (42, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0042', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-07-15', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (43, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0043', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-08-16', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (44, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0044', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-09-17', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (45, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0045', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-10-18', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (46, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0046', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-11-19', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (47, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0047', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-12-20', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (48, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0048', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-01-21', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (49, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0049', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-02-22', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (50, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0050', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-03-23', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (51, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0051', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-04-24', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (52, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0052', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-05-25', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (53, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0053', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-06-26', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (54, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0054', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-07-27', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (55, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0055', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-08-28', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (56, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0056', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-09-01', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (57, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0057', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-10-02', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (58, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0058', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-11-03', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (59, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0059', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-12-04', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (60, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0060', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-01-05', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (61, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0061', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-02-06', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (62, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0062', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-03-07', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (63, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0063', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-04-08', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (64, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0064', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-05-09', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (65, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0065', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-06-10', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (66, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0066', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-07-11', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (67, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0067', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-08-12', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (68, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0068', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-09-13', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (69, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0069', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-10-14', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (70, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0070', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-11-15', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (71, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0071', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-12-16', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (72, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0072', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-01-17', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (73, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0073', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-02-18', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (74, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0074', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-03-19', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (75, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0075', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-04-20', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (76, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0076', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-05-21', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (77, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0077', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-06-22', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (78, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0078', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-07-23', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (79, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0079', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-08-24', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (80, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0080', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-09-25', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (81, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0081', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-10-26', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (82, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0082', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-11-27', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (83, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0083', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-12-28', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (84, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0084', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-01-01', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (85, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0085', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-02-02', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (86, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0086', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-03-03', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (87, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0087', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-04-04', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (88, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0088', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-05-05', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (89, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0089', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-06-06', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (90, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0090', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-07-07', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (91, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0091', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-08-08', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (92, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0092', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-09-09', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (93, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0093', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-10-10', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (94, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0094', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-11-11', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (95, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0095', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-12-12', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (96, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0096', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-01-13', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (97, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0097', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-02-14', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (98, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0098', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-03-15', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (99, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0099', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-04-16', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (100, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0100', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-05-17', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (101, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0101', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-06-18', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (102, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0102', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-07-19', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (103, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0103', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-08-20', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (104, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0104', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-09-21', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (105, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0105', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-10-22', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (106, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0106', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-11-23', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (107, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0107', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-12-24', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (108, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0108', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-01-25', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (109, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0109', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-02-26', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (110, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0110', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-03-27', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (111, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0111', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-04-28', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (112, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0112', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-05-01', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (113, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0113', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-06-02', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (114, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0114', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-07-03', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (115, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0115', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-08-04', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (116, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0116', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-09-05', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (117, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0117', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-10-06', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (118, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0118', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-11-07', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (119, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0119', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-12-08', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (120, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0120', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-01-09', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (121, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0121', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-02-10', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (122, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0122', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-03-11', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (123, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0123', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-04-12', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (124, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0124', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-05-13', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (125, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0125', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-06-14', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (126, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0126', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-07-15', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (127, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0127', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-08-16', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (128, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0128', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-09-17', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (129, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0129', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-10-18', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (130, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0130', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-11-19', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (131, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0131', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-12-20', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (132, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0132', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-01-21', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (133, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0133', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-02-22', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (134, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0134', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-03-23', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (135, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0135', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-04-24', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (136, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0136', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-05-25', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (137, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0137', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-06-26', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (138, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0138', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-07-27', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (139, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0139', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-08-28', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (140, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0140', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-09-01', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (141, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0141', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-10-02', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (142, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0142', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-11-03', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (143, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0143', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-12-04', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (144, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0144', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-01-05', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (145, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0145', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-02-06', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (146, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0146', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-03-07', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (147, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0147', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-04-08', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (148, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0148', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-05-09', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (149, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0149', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-06-10', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (150, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0150', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-07-11', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (151, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0151', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-08-12', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (152, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0152', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-09-13', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (153, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0153', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-10-14', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (154, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0154', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-11-15', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (155, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0155', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-12-16', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (156, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0156', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-01-17', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (157, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0157', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-02-18', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (158, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0158', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-03-19', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (159, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0159', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-04-20', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (160, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0160', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-05-21', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (161, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0161', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-06-22', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (162, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0162', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-07-23', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (163, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0163', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-08-24', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (164, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0164', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-09-25', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (165, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0165', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-10-26', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (166, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0166', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-11-27', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (167, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0167', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-12-28', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (168, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0168', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-01-01', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (169, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0169', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-02-02', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (170, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0170', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-03-03', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (171, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0171', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-04-04', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (172, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0172', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-05-05', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (173, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0173', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-06-06', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (174, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0174', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-07-07', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (175, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0175', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-08-08', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (176, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0176', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-09-09', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (177, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0177', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-10-10', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (178, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0178', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-11-11', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (179, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0179', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-12-12', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (180, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0180', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-01-13', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (181, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0181', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-02-14', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (182, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0182', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-03-15', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (183, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0183', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-04-16', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (184, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0184', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-05-17', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (185, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0185', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-06-18', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (186, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0186', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-07-19', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (187, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0187', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-08-20', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (188, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0188', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-09-21', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (189, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0189', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-10-22', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (190, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0190', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-11-23', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (191, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0191', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-12-24', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (192, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0192', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-01-25', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (193, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0193', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-02-26', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (194, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0194', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-03-27', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (195, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0195', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-04-28', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (196, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0196', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-05-01', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (197, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0197', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-06-02', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (198, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0198', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-07-03', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (199, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0199', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-08-04', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (200, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0200', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-09-05', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (201, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0201', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-10-06', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (202, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0202', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-11-07', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (203, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0203', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-12-08', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (204, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0204', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-01-09', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (205, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0205', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-02-10', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (206, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0206', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-03-11', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (207, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0207', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-04-12', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (208, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0208', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-05-13', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (209, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0209', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-06-14', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (210, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0210', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-07-15', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (211, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0211', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-08-16', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (212, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0212', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-09-17', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (213, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0213', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-10-18', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (214, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0214', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-11-19', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (215, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0215', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-12-20', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (216, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0216', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-01-21', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (217, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0217', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-02-22', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (218, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0218', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-03-23', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (219, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0219', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-04-24', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (220, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0220', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-05-25', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (221, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0221', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-06-26', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (222, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0222', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-07-27', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (223, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0223', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-08-28', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (224, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0224', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-09-01', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (225, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0225', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-10-02', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (226, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0226', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-11-03', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (227, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0227', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-12-04', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (228, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0228', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-01-05', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (229, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0229', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-02-06', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (230, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0230', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-03-07', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (231, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0231', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-04-08', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (232, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0232', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-05-09', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (233, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0233', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-06-10', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (234, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0234', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-07-11', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (235, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0235', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-08-12', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (236, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0236', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-09-13', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (237, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0237', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-10-14', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (238, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0238', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-11-15', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (239, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0239', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-12-16', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (240, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0240', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-01-17', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (241, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0241', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-02-18', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (242, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0242', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-03-19', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (243, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0243', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-04-20', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (244, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0244', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-05-21', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (245, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0245', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-06-22', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (246, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0246', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-07-23', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (247, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0247', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-08-24', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (248, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0248', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-09-25', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (249, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0249', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-10-26', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (250, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0250', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-11-27', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (251, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0251', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-12-28', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (252, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0252', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-01-01', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (253, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0253', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-02-02', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (254, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0254', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-03-03', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (255, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0255', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-04-04', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (256, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0256', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-05-05', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (257, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0257', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-06-06', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (258, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0258', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-07-07', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (259, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0259', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-08-08', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (260, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0260', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-09-09', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (261, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0261', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-10-10', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (262, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0262', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-11-11', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (263, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0263', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-12-12', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (264, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0264', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-01-13', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (265, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0265', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-02-14', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (266, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0266', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-03-15', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (267, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0267', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-04-16', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (268, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0268', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-05-17', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (269, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0269', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-06-18', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (270, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0270', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-07-19', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (271, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0271', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-08-20', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (272, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0272', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-09-21', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (273, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0273', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-10-22', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (274, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0274', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-11-23', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (275, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0275', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-12-24', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (276, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0276', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-01-25', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (277, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0277', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-02-26', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (278, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0278', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-03-27', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (279, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0279', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-04-28', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (280, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0280', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-05-01', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (281, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0281', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-06-02', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (282, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0282', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-07-03', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (283, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0283', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-08-04', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (284, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0284', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-09-05', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (285, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0285', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-10-06', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (286, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0286', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-11-07', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (287, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0287', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-12-08', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (288, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0288', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-01-09', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (289, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0289', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-02-10', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (290, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0290', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-03-11', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (291, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0291', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-04-12', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (292, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0292', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-05-13', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (293, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0293', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-06-14', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (294, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0294', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-07-15', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (295, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0295', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-08-16', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (296, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0296', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-09-17', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (297, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0297', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-10-18', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (298, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0298', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-11-19', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (299, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0299', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-12-20', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (300, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0300', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-01-21', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (301, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0301', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-02-22', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (302, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0302', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-03-23', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (303, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0303', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-04-24', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (304, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0304', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-05-25', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (305, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0305', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-06-26', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (306, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0306', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-07-27', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (307, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0307', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-08-28', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (308, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0308', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-09-01', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (309, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0309', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-10-02', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (310, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0310', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-11-03', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (311, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0311', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-12-04', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (312, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0312', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-01-05', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (313, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0313', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-02-06', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (314, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0314', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-03-07', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (315, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0315', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-04-08', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (316, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0316', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-05-09', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (317, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0317', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-06-10', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (318, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0318', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-07-11', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (319, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0319', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-08-12', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (320, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0320', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-09-13', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (321, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0321', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-10-14', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (322, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0322', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-11-15', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (323, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0323', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-12-16', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (324, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0324', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-01-17', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (325, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0325', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-02-18', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (326, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0326', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-03-19', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (327, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0327', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-04-20', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (328, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0328', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-05-21', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (329, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0329', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-06-22', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (330, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0330', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-07-23', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (331, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0331', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-08-24', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (332, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0332', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-09-25', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (333, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0333', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-10-26', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (334, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0334', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-11-27', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (335, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0335', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-12-28', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (336, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0336', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-01-01', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (337, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0337', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-02-02', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (338, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0338', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-03-03', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (339, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0339', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-04-04', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (340, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0340', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-05-05', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (341, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0341', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-06-06', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (342, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0342', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-07-07', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (343, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0343', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-08-08', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (344, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0344', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-09-09', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (345, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0345', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-10-10', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (346, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0346', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-11-11', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (347, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0347', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-12-12', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (348, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0348', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-01-13', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (349, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0349', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-02-14', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (350, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0350', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-03-15', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (351, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0351', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-04-16', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (352, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0352', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-05-17', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (353, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0353', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-06-18', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (354, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0354', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-07-19', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (355, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0355', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-08-20', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (356, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0356', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-09-21', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (357, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0357', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-10-22', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (358, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0358', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-11-23', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (359, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0359', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-12-24', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (360, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0360', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-01-25', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (361, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0361', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-02-26', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (362, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0362', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-03-27', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (363, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0363', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-04-28', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (364, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0364', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-05-01', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (365, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0365', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-06-02', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (366, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0366', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-07-03', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (367, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0367', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-08-04', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (368, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0368', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-09-05', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (369, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0369', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-10-06', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (370, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0370', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-11-07', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (371, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0371', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-12-08', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (372, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0372', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-01-09', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (373, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0373', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-02-10', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (374, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0374', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-03-11', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (375, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0375', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-04-12', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (376, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0376', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-05-13', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (377, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0377', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-06-14', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (378, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0378', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-07-15', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (379, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0379', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-08-16', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (380, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0380', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-09-17', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (381, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0381', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-10-18', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (382, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0382', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-11-19', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (383, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0383', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-12-20', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (384, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0384', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-01-21', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (385, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0385', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-02-22', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (386, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0386', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-03-23', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (387, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0387', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-04-24', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (388, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0388', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-05-25', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (389, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0389', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-06-26', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (390, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0390', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-07-27', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (391, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0391', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-08-28', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (392, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0392', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-09-01', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (393, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0393', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-10-02', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (394, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0394', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-11-03', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (395, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0395', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-12-04', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (396, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0396', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-01-05', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (397, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0397', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-02-06', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (398, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0398', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-03-07', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (399, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0399', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-04-08', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (400, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0400', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-05-09', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (401, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0401', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-06-10', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (402, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0402', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-07-11', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (403, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0403', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-08-12', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (404, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0404', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-09-13', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (405, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0405', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-10-14', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (406, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0406', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-11-15', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (407, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0407', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-12-16', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (408, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0408', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-01-17', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (409, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0409', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-02-18', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (410, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0410', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-03-19', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (411, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0411', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-04-20', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (412, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0412', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-05-21', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (413, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0413', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-06-22', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (414, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0414', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-07-23', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (415, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0415', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-08-24', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (416, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0416', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-09-25', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (417, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0417', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-10-26', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (418, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0418', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-11-27', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (419, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0419', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-12-28', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (420, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0420', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-01-01', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (421, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0421', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-02-02', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (422, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0422', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-03-03', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (423, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0423', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-04-04', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (424, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0424', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-05-05', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (425, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0425', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-06-06', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (426, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0426', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-07-07', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (427, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0427', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-08-08', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (428, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0428', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-09-09', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (429, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0429', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-10-10', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (430, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0430', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-11-11', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (431, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0431', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-12-12', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (432, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0432', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-01-13', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (433, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0433', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-02-14', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (434, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0434', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-03-15', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (435, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0435', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-04-16', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (436, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0436', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-05-17', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (437, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0437', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-06-18', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (438, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0438', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-07-19', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (439, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0439', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-08-20', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (440, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0440', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-09-21', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (441, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0441', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-10-22', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (442, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0442', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-11-23', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (443, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0443', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-12-24', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (444, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0444', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-01-25', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (445, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0445', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-02-26', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (446, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0446', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-03-27', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (447, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0447', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-04-28', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (448, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0448', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-05-01', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (449, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0449', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-06-02', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (450, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0450', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-07-03', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (451, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0451', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-08-04', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (452, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0452', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-09-05', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (453, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0453', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-10-06', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (454, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0454', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-11-07', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (455, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0455', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-12-08', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (456, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0456', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-01-09', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (457, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0457', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-02-10', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (458, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0458', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-03-11', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (459, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0459', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-04-12', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (460, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0460', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-05-13', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (461, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0461', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-06-14', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (462, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0462', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-07-15', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (463, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0463', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-08-16', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (464, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0464', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-09-17', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (465, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0465', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-10-18', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (466, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0466', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-11-19', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (467, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0467', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-12-20', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (468, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0468', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-01-21', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (469, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0469', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-02-22', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (470, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0470', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-03-23', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (471, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0471', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-04-24', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (472, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0472', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-05-25', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (473, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0473', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-06-26', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (474, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0474', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-07-27', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (475, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0475', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-08-28', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (476, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0476', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-09-01', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (477, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0477', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-10-02', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (478, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0478', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-11-03', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (479, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0479', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-12-04', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (480, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0480', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-01-05', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (481, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0481', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-02-06', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (482, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0482', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-03-07', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (483, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0483', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-04-08', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (484, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0484', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-05-09', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (485, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0485', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-06-10', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (486, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0486', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-07-11', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (487, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0487', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-08-12', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (488, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0488', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-09-13', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (489, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0489', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-10-14', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (490, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0490', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-11-15', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (491, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0491', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-12-16', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (492, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0492', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-01-17', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (493, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0493', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-02-18', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (494, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0494', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-03-19', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (495, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0495', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-04-20', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (496, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0496', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-05-21', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (497, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0497', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-06-22', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (498, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0498', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-07-23', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (499, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0499', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-08-24', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (500, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0500', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-09-25', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (501, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0501', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-10-26', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (502, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0502', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-11-27', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (503, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0503', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-12-28', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (504, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0504', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-01-01', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (505, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0505', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-02-02', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (506, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0506', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-03-03', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (507, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0507', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-04-04', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (508, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0508', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-05-05', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (509, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0509', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-06-06', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (510, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0510', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-07-07', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (511, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0511', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-08-08', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (512, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0512', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-09-09', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (513, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0513', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-10-10', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (514, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0514', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-11-11', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (515, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0515', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-12-12', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (516, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0516', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-01-13', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (517, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0517', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-02-14', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (518, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0518', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-03-15', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (519, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0519', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-04-16', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (520, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0520', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-05-17', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (521, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0521', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-06-18', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (522, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0522', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-07-19', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (523, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0523', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-08-20', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (524, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0524', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-09-21', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (525, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0525', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-10-22', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (526, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0526', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-11-23', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (527, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0527', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-12-24', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (528, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0528', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-01-25', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (529, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0529', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-02-26', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (530, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0530', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-03-27', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (531, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0531', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-04-28', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (532, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0532', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-05-01', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (533, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0533', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-06-02', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (534, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0534', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-07-03', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (535, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0535', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-08-04', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (536, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0536', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-09-05', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (537, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0537', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-10-06', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (538, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0538', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-11-07', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (539, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0539', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-12-08', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (540, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0540', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-01-09', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (541, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0541', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-02-10', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (542, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0542', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-03-11', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (543, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0543', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-04-12', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (544, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0544', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-05-13', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (545, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0545', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-06-14', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (546, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0546', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-07-15', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (547, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0547', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-08-16', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (548, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0548', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-09-17', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (549, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0549', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-10-18', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (550, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0550', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-11-19', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (551, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0551', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-12-20', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (552, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0552', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-01-21', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (553, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0553', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-02-22', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (554, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0554', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-03-23', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (555, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0555', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-04-24', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (556, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0556', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-05-25', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (557, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0557', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-06-26', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (558, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0558', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-07-27', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (559, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0559', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-08-28', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (560, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0560', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-09-01', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (561, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0561', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-10-02', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (562, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0562', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-11-03', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (563, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0563', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-12-04', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (564, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0564', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-01-05', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (565, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0565', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-02-06', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (566, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0566', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-03-07', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (567, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0567', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-04-08', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (568, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0568', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-05-09', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (569, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0569', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-06-10', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (570, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0570', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-07-11', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (571, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0571', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-08-12', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (572, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0572', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-09-13', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (573, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0573', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-10-14', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (574, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0574', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-11-15', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (575, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0575', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-12-16', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (576, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0576', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-01-17', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (577, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0577', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-02-18', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (578, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0578', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-03-19', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (579, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0579', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-04-20', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (580, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0580', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-05-21', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (581, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0581', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-06-22', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (582, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0582', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-07-23', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (583, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0583', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-08-24', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (584, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0584', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-09-25', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (585, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0585', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-10-26', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (586, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0586', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-11-27', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (587, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0587', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-12-28', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (588, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0588', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-01-01', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (589, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0589', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-02-02', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (590, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0590', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-03-03', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (591, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0591', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-04-04', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (592, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0592', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-05-05', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (593, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0593', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-06-06', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (594, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0594', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-07-07', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (595, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0595', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-08-08', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (596, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0596', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-09-09', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (597, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0597', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-10-10', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (598, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0598', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-11-11', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (599, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0599', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-12-12', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (600, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0600', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-01-13', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (601, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0601', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-02-14', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (602, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0602', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-03-15', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (603, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0603', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-04-16', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (604, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0604', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-05-17', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (605, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0605', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-06-18', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (606, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0606', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-07-19', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (607, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0607', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-08-20', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (608, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0608', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-09-21', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (609, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0609', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-10-22', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (610, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0610', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-11-23', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (611, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0611', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-12-24', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (612, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0612', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-01-25', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (613, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0613', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-02-26', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (614, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0614', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-03-27', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (615, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0615', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-04-28', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (616, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0616', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-05-01', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (617, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0617', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-06-02', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (618, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0618', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-07-03', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (619, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0619', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-08-04', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (620, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0620', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-09-05', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (621, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0621', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-10-06', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (622, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0622', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-11-07', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (623, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0623', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-12-08', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (624, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0624', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-01-09', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (625, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0625', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-02-10', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (626, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0626', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-03-11', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (627, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0627', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-04-12', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (628, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0628', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-05-13', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (629, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0629', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-06-14', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (630, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0630', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-07-15', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (631, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0631', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-08-16', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (632, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0632', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-09-17', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (633, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0633', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-10-18', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (634, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0634', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-11-19', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (635, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0635', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-12-20', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (636, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0636', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-01-21', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (637, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0637', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-02-22', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (638, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0638', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-03-23', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (639, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0639', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-04-24', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (640, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0640', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-05-25', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (641, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0641', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-06-26', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (642, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0642', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-07-27', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (643, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0643', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-08-28', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (644, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0644', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-09-01', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (645, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0645', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-10-02', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (646, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0646', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-11-03', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (647, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0647', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-12-04', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (648, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0648', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-01-05', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (649, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0649', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-02-06', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (650, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0650', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-03-07', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (651, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0651', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-04-08', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (652, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0652', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-05-09', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (653, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0653', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-06-10', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (654, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0654', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-07-11', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (655, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0655', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-08-12', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (656, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0656', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-09-13', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (657, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0657', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-10-14', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (658, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0658', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-11-15', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (659, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0659', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-12-16', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (660, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0660', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-01-17', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (661, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0661', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-02-18', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (662, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0662', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-03-19', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (663, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0663', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-04-20', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (664, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0664', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-05-21', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (665, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0665', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-06-22', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (666, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0666', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-07-23', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (667, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0667', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-08-24', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (668, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0668', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-09-25', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (669, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0669', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-10-26', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (670, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0670', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-11-27', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (671, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0671', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-12-28', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (672, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0672', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-01-01', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (673, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0673', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-02-02', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (674, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0674', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-03-03', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (675, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0675', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-04-04', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (676, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0676', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-05-05', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (677, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0677', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-06-06', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (678, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0678', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-07-07', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (679, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0679', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-08-08', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (680, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0680', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-09-09', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (681, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0681', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-10-10', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (682, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0682', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-11-11', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (683, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0683', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-12-12', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (684, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0684', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-01-13', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (685, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0685', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-02-14', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (686, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0686', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-03-15', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (687, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0687', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-04-16', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (688, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0688', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-05-17', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (689, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0689', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-06-18', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (690, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0690', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-07-19', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (691, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0691', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-08-20', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (692, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0692', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-09-21', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (693, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0693', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-10-22', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (694, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0694', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-11-23', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (695, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0695', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-12-24', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (696, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0696', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-01-25', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (697, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0697', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-02-26', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (698, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0698', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-03-27', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (699, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0699', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-04-28', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (700, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0700', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-05-01', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (701, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0701', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-06-02', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (702, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0702', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-07-03', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (703, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0703', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-08-04', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (704, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0704', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-09-05', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (705, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0705', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-10-06', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (706, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0706', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-11-07', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (707, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0707', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-12-08', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (708, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0708', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-01-09', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (709, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0709', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-02-10', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (710, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0710', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-03-11', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (711, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0711', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-04-12', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (712, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0712', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-05-13', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (713, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0713', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-06-14', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (714, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0714', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-07-15', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (715, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0715', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-08-16', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (716, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0716', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-09-17', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (717, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0717', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-10-18', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (718, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0718', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-11-19', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (719, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0719', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-12-20', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (720, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0720', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-01-21', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (721, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0721', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-02-22', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (722, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0722', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-03-23', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (723, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0723', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-04-24', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (724, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0724', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-05-25', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (725, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0725', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-06-26', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (726, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0726', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-07-27', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (727, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0727', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-08-28', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (728, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0728', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-09-01', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (729, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0729', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-10-02', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (730, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0730', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-11-03', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (731, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0731', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-12-04', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (732, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0732', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-01-05', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (733, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0733', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-02-06', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (734, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0734', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-03-07', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (735, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0735', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-04-08', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (736, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0736', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-05-09', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (737, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0737', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-06-10', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (738, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0738', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-07-11', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (739, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0739', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-08-12', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (740, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0740', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-09-13', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (741, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0741', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-10-14', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (742, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0742', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-11-15', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (743, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0743', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-12-16', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (744, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0744', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-01-17', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (745, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0745', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-02-18', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (746, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0746', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-03-19', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (747, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0747', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-04-20', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (748, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0748', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-05-21', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (749, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0749', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-06-22', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (750, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0750', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-07-23', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (751, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0751', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-08-24', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (752, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0752', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-09-25', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (753, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0753', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-10-26', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (754, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0754', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-11-27', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (755, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0755', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-12-28', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (756, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0756', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-01-01', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (757, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0757', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-02-02', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (758, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0758', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-03-03', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (759, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0759', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-04-04', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (760, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0760', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-05-05', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (761, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0761', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-06-06', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (762, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0762', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-07-07', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (763, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0763', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-08-08', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (764, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0764', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-09-09', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (765, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0765', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-10-10', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (766, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0766', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-11-11', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (767, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0767', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-12-12', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (768, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0768', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-01-13', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (769, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0769', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-02-14', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (770, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0770', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-03-15', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (771, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0771', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-04-16', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (772, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0772', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-05-17', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (773, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0773', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-06-18', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (774, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0774', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-07-19', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (775, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0775', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-08-20', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (776, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0776', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-09-21', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (777, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0777', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-10-22', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (778, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0778', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-11-23', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (779, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0779', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-12-24', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (780, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0780', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-01-25', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (781, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0781', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-02-26', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (782, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0782', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-03-27', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (783, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0783', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-04-28', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (784, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0784', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-05-01', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (785, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0785', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-06-02', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (786, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0786', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-07-03', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (787, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0787', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-08-04', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (788, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0788', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-09-05', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (789, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0789', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-10-06', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (790, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0790', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-11-07', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (791, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0791', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-12-08', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (792, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0792', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-01-09', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (793, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0793', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-02-10', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (794, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0794', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-03-11', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (795, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0795', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-04-12', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (796, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0796', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-05-13', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (797, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0797', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-06-14', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (798, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0798', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-07-15', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (799, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0799', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-08-16', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (800, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0800', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-09-17', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (801, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0801', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-10-18', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (802, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0802', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-11-19', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (803, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0803', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-12-20', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (804, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0804', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-01-21', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (805, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0805', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-02-22', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (806, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0806', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-03-23', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (807, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0807', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-04-24', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (808, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0808', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-05-25', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (809, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0809', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-06-26', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (810, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0810', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-07-27', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (811, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0811', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-08-28', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (812, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0812', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-09-01', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (813, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0813', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-10-02', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (814, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0814', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-11-03', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (815, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0815', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-12-04', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (816, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0816', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-01-05', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (817, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0817', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-02-06', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (818, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0818', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-03-07', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (819, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0819', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-04-08', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (820, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0820', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-05-09', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (821, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0821', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-06-10', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (822, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0822', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-07-11', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (823, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0823', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-08-12', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (824, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0824', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-09-13', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (825, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0825', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-10-14', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (826, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0826', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-11-15', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (827, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0827', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-12-16', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (828, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0828', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-01-17', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (829, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0829', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-02-18', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (830, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0830', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-03-19', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (831, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0831', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-04-20', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (832, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0832', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-05-21', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (833, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0833', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-06-22', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (834, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0834', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-07-23', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (835, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0835', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-08-24', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (836, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0836', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-09-25', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (837, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0837', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-10-26', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (838, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0838', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-11-27', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (839, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0839', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-12-28', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (840, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0840', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-01-01', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (841, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0841', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-02-02', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (842, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0842', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-03-03', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (843, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0843', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-04-04', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (844, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0844', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-05-05', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (845, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0845', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-06-06', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (846, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0846', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-07-07', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (847, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0847', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-08-08', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (848, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0848', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-09-09', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (849, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0849', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-10-10', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (850, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0850', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-11-11', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (851, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0851', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-12-12', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (852, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0852', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-01-13', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (853, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0853', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-02-14', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (854, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0854', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-03-15', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (855, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0855', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-04-16', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (856, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0856', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-05-17', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (857, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0857', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-06-18', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (858, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0858', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-07-19', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (859, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0859', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-08-20', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (860, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0860', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-09-21', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (861, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0861', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-10-22', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (862, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0862', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-11-23', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (863, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0863', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-12-24', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (864, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0864', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-01-25', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (865, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0865', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-02-26', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (866, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0866', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-03-27', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (867, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0867', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-04-28', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (868, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0868', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-05-01', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (869, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0869', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-06-02', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (870, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0870', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-07-03', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (871, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0871', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-08-04', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (872, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0872', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-09-05', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (873, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0873', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-10-06', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (874, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0874', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-11-07', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (875, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0875', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-12-08', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (876, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0876', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-01-09', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (877, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0877', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-02-10', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (878, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0878', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-03-11', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (879, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0879', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-04-12', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (880, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0880', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-05-13', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (881, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0881', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-06-14', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (882, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0882', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-07-15', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (883, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0883', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-08-16', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (884, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0884', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-09-17', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (885, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0885', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-10-18', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (886, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0886', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-11-19', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (887, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0887', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-12-20', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (888, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0888', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-01-21', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (889, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0889', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-02-22', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (890, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0890', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-03-23', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (891, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0891', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-04-24', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (892, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0892', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-05-25', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (893, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0893', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-06-26', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (894, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0894', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-07-27', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (895, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0895', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-08-28', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (896, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0896', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-09-01', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (897, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0897', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-10-02', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (898, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0898', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-11-03', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (899, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0899', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-12-04', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (900, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0900', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-01-05', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (901, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0901', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.1 - 마지막 업데이트: 2025-02-06', '{"version": "2.0.1", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (902, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0902', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.2 - 마지막 업데이트: 2025-03-07', '{"version": "3.0.2", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (903, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0903', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.3 - 마지막 업데이트: 2025-04-08', '{"version": "4.0.3", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (904, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0904', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.4 - 마지막 업데이트: 2025-05-09', '{"version": "5.0.4", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (905, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0905', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.5 - 마지막 업데이트: 2025-06-10', '{"version": "6.0.5", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (906, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0906', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.6 - 마지막 업데이트: 2025-07-11', '{"version": "7.0.6", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (907, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0907', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.7 - 마지막 업데이트: 2025-08-12', '{"version": "8.0.7", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (908, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0908', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.8 - 마지막 업데이트: 2025-09-13', '{"version": "9.0.8", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (909, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0909', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.9 - 마지막 업데이트: 2025-10-14', '{"version": "10.0.9", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (910, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0910', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.10 - 마지막 업데이트: 2025-11-15', '{"version": "1.0.10", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (911, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0911', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.11 - 마지막 업데이트: 2025-12-16', '{"version": "2.0.11", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (912, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0912', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.12 - 마지막 업데이트: 2025-01-17', '{"version": "3.0.12", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (913, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0913', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.13 - 마지막 업데이트: 2025-02-18', '{"version": "4.0.13", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (914, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0914', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.14 - 마지막 업데이트: 2025-03-19', '{"version": "5.0.14", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (915, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0915', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.15 - 마지막 업데이트: 2025-04-20', '{"version": "6.0.15", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (916, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0916', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.16 - 마지막 업데이트: 2025-05-21', '{"version": "7.0.16", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (917, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0917', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.17 - 마지막 업데이트: 2025-06-22', '{"version": "8.0.17", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (918, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0918', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.18 - 마지막 업데이트: 2025-07-23', '{"version": "9.0.18", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (919, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0919', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.19 - 마지막 업데이트: 2025-08-24', '{"version": "10.0.19", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (920, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0920', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.20 - 마지막 업데이트: 2025-09-25', '{"version": "1.0.20", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (921, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0921', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.21 - 마지막 업데이트: 2025-10-26', '{"version": "2.0.21", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (922, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0922', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.22 - 마지막 업데이트: 2025-11-27', '{"version": "3.0.22", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (923, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0923', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.23 - 마지막 업데이트: 2025-12-28', '{"version": "4.0.23", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (924, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0924', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.24 - 마지막 업데이트: 2025-01-01', '{"version": "5.0.24", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (925, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0925', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.25 - 마지막 업데이트: 2025-02-02', '{"version": "6.0.25", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (926, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0926', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.26 - 마지막 업데이트: 2025-03-03', '{"version": "7.0.26", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (927, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0927', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.27 - 마지막 업데이트: 2025-04-04', '{"version": "8.0.27", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (928, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0928', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.28 - 마지막 업데이트: 2025-05-05', '{"version": "9.0.28", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (929, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0929', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.29 - 마지막 업데이트: 2025-06-06', '{"version": "10.0.29", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (930, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0930', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.30 - 마지막 업데이트: 2025-07-07', '{"version": "1.0.30", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (931, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0931', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.31 - 마지막 업데이트: 2025-08-08', '{"version": "2.0.31", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (932, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0932', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.32 - 마지막 업데이트: 2025-09-09', '{"version": "3.0.32", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (933, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0933', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.33 - 마지막 업데이트: 2025-10-10', '{"version": "4.0.33", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (934, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0934', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.34 - 마지막 업데이트: 2025-11-11', '{"version": "5.0.34", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (935, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0935', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.35 - 마지막 업데이트: 2025-12-12', '{"version": "6.0.35", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (936, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0936', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.36 - 마지막 업데이트: 2025-01-13', '{"version": "7.0.36", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (937, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0937', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.37 - 마지막 업데이트: 2025-02-14', '{"version": "8.0.37", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (938, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0938', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.38 - 마지막 업데이트: 2025-03-15', '{"version": "9.0.38", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (939, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0939', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.39 - 마지막 업데이트: 2025-04-16', '{"version": "10.0.39", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (940, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0940', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.40 - 마지막 업데이트: 2025-05-17', '{"version": "1.0.40", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (941, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0941', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.41 - 마지막 업데이트: 2025-06-18', '{"version": "2.0.41", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (942, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0942', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.42 - 마지막 업데이트: 2025-07-19', '{"version": "3.0.42", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (943, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0943', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.43 - 마지막 업데이트: 2025-08-20', '{"version": "4.0.43", "category": "file", "keywords": ["devops", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (944, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0944', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.44 - 마지막 업데이트: 2025-09-21', '{"version": "5.0.44", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (945, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0945', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.45 - 마지막 업데이트: 2025-10-22', '{"version": "6.0.45", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (946, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0946', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.46 - 마지막 업데이트: 2025-11-23', '{"version": "7.0.46", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (947, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0947', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.47 - 마지막 업데이트: 2025-12-24', '{"version": "8.0.47", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (948, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0948', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.48 - 마지막 업데이트: 2025-01-25', '{"version": "9.0.48", "category": "search", "keywords": ["devops", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (949, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0949', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.49 - 마지막 업데이트: 2025-02-26', '{"version": "10.0.49", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (950, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0950', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.50 - 마지막 업데이트: 2025-03-27', '{"version": "1.0.50", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (951, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0951', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.51 - 마지막 업데이트: 2025-04-28', '{"version": "2.0.51", "category": "database", "keywords": ["frontend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (952, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0952', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.52 - 마지막 업데이트: 2025-05-01', '{"version": "3.0.52", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (953, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0953', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.53 - 마지막 업데이트: 2025-06-02', '{"version": "4.0.53", "category": "file", "keywords": ["devops", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (954, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0954', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.54 - 마지막 업데이트: 2025-07-03', '{"version": "5.0.54", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (955, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0955', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.55 - 마지막 업데이트: 2025-08-04', '{"version": "6.0.55", "category": "logging", "keywords": ["backend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (956, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0956', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.56 - 마지막 업데이트: 2025-09-05', '{"version": "7.0.56", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (957, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0957', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.57 - 마지막 업데이트: 2025-10-06', '{"version": "8.0.57", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (958, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0958', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.58 - 마지막 업데이트: 2025-11-07', '{"version": "9.0.58", "category": "search", "keywords": ["devops", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (959, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0959', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.59 - 마지막 업데이트: 2025-12-08', '{"version": "10.0.59", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (960, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0960', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.60 - 마지막 업데이트: 2025-01-09', '{"version": "1.0.60", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (961, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0961', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.61 - 마지막 업데이트: 2025-02-10', '{"version": "2.0.61", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (962, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0962', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.62 - 마지막 업데이트: 2025-03-11', '{"version": "3.0.62", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (963, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0963', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.63 - 마지막 업데이트: 2025-04-12', '{"version": "4.0.63", "category": "file", "keywords": ["devops", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (964, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0964', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.64 - 마지막 업데이트: 2025-05-13', '{"version": "5.0.64", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (965, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0965', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.65 - 마지막 업데이트: 2025-06-14', '{"version": "6.0.65", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (966, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0966', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.66 - 마지막 업데이트: 2025-07-15', '{"version": "7.0.66", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (967, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0967', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.67 - 마지막 업데이트: 2025-08-16', '{"version": "8.0.67", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (968, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0968', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.68 - 마지막 업데이트: 2025-09-17', '{"version": "9.0.68", "category": "search", "keywords": ["devops", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (969, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0969', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.69 - 마지막 업데이트: 2025-10-18', '{"version": "10.0.69", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (970, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0970', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.70 - 마지막 업데이트: 2025-11-19', '{"version": "1.0.70", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (971, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0971', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.71 - 마지막 업데이트: 2025-12-20', '{"version": "2.0.71", "category": "database", "keywords": ["frontend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (972, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0972', 'completed', 3, false, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.72 - 마지막 업데이트: 2025-01-21', '{"version": "3.0.72", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (973, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0973', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.73 - 마지막 업데이트: 2025-02-22', '{"version": "4.0.73", "category": "file", "keywords": ["devops", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (974, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0974', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.74 - 마지막 업데이트: 2025-03-23', '{"version": "5.0.74", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (975, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0975', 'active', 1, false, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.75 - 마지막 업데이트: 2025-04-24', '{"version": "6.0.75", "category": "logging", "keywords": ["backend", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (976, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0976', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.76 - 마지막 업데이트: 2025-05-25', '{"version": "7.0.76", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (977, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0977', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.77 - 마지막 업데이트: 2025-06-26', '{"version": "8.0.77", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (978, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0978', 'inactive', 4, false, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.78 - 마지막 업데이트: 2025-07-27', '{"version": "9.0.78", "category": "search", "keywords": ["devops", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (979, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0979', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.79 - 마지막 업데이트: 2025-08-28', '{"version": "10.0.79", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (980, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-0980', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.80 - 마지막 업데이트: 2025-09-01', '{"version": "1.0.80", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (981, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 세션 관리', 'DB-0981', 'pending', 2, false, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.81 - 마지막 업데이트: 2025-10-02', '{"version": "2.0.81", "category": "database", "keywords": ["frontend", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (982, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 쿼리 최적화', 'API-0982', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.82 - 마지막 업데이트: 2025-11-03', '{"version": "3.0.82", "category": "api", "keywords": ["fullstack", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (983, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 인덱스 생성', 'FILE-0983', 'inactive', 4, true, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.83 - 마지막 업데이트: 2025-12-04', '{"version": "4.0.83", "category": "file", "keywords": ["devops", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (984, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 REST API 구현', 'CACHE-0984', 'draft', 5, false, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.84 - 마지막 업데이트: 2025-01-05', '{"version": "5.0.84", "category": "cache", "keywords": ["infrastructure", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (985, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 GraphQL 스키마', 'LOG-0985', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.85 - 마지막 업데이트: 2025-02-06', '{"version": "6.0.85", "category": "logging", "keywords": ["backend", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (986, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 이미지 업로드', 'NOTI-0986', 'pending', 2, true, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.86 - 마지막 업데이트: 2025-03-07', '{"version": "7.0.86", "category": "notification", "keywords": ["frontend", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (987, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 PDF 생성', 'PAY-0987', 'completed', 3, false, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.87 - 마지막 업데이트: 2025-04-08', '{"version": "8.0.87", "category": "payment", "keywords": ["fullstack", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (988, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 Redis 연동', 'SEARCH-0988', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.88 - 마지막 업데이트: 2025-05-09', '{"version": "9.0.88", "category": "search", "keywords": ["devops", "typescript"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (989, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 Memcached 설정', 'BATCH-0989', 'draft', 5, true, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.89 - 마지막 업데이트: 2025-06-10', '{"version": "10.0.89", "category": "batch", "keywords": ["infrastructure", "nodejs"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (990, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 Winston 로거', 'AUTH-0990', 'active', 1, false, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.90 - 마지막 업데이트: 2025-07-11', '{"version": "1.0.90", "category": "authentication", "keywords": ["backend", "postgresql"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (991, '2025-12-11 16:45:01.536+09', NULL, '데이터베이스 ELK 스택 연동', 'DB-0991', 'pending', 2, true, 'PostgreSQL 데이터베이스 연결 및 쿼리 실행을 담당합니다. Connection Pool을 관리하고, 트랜잭션 처리와 데드락 방지 로직을 구현합니다. 버전: 2.0.91 - 마지막 업데이트: 2025-08-12', '{"version": "2.0.91", "category": "database", "keywords": ["frontend", "redis"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (992, '2025-12-11 16:45:01.536+09', NULL, 'API 엔드포인트 FCM 푸시 알림', 'API-0992', 'completed', 3, true, 'RESTful API 엔드포인트를 정의하고 요청/응답을 처리합니다. 입력 유효성 검사, 에러 핸들링, 응답 포맷 표준화를 수행합니다. 버전: 3.0.92 - 마지막 업데이트: 2025-09-13', '{"version": "3.0.92", "category": "api", "keywords": ["fullstack", "typescript"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (993, '2025-12-11 16:45:01.536+09', NULL, '파일 처리 이메일 발송', 'FILE-0993', 'inactive', 4, false, '파일 업로드, 다운로드, 변환 기능을 제공합니다. S3 호환 스토리지 연동과 이미지 리사이징, PDF 변환 등을 지원합니다. 버전: 4.0.93 - 마지막 업데이트: 2025-10-14', '{"version": "4.0.93", "category": "file", "keywords": ["devops", "nodejs"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (994, '2025-12-11 16:45:01.536+09', NULL, '캐시 관리 PG 결제 연동', 'CACHE-0994', 'draft', 5, true, 'Redis를 활용한 캐시 관리 시스템입니다. 캐시 무효화 전략, TTL 관리, 캐시 워밍업 기능을 제공합니다. 버전: 5.0.94 - 마지막 업데이트: 2025-11-15', '{"version": "5.0.94", "category": "cache", "keywords": ["infrastructure", "postgresql"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (995, '2025-12-11 16:45:01.536+09', NULL, '로깅 시스템 정기 구독 처리', 'LOG-0995', 'active', 1, true, '애플리케이션 로그를 수집하고 관리합니다. 구조화된 로깅, 로그 레벨 관리, 외부 로그 시스템 연동을 지원합니다. 버전: 6.0.95 - 마지막 업데이트: 2025-12-16', '{"version": "6.0.95", "category": "logging", "keywords": ["backend", "redis"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (996, '2025-12-11 16:45:01.536+09', NULL, '알림 서비스 Elasticsearch 연동', 'NOTI-0996', 'pending', 2, false, '푸시 알림, 이메일, SMS 등 다양한 알림 채널을 통합 관리합니다. 알림 템플릿, 발송 이력, 재시도 로직을 포함합니다. 버전: 7.0.96 - 마지막 업데이트: 2025-01-17', '{"version": "7.0.96", "category": "notification", "keywords": ["frontend", "typescript"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (997, '2025-12-11 16:45:01.536+09', NULL, '결제 처리 전문 검색 구현', 'PAY-0997', 'completed', 3, true, 'PG사 연동을 통한 결제 처리 시스템입니다. 결제 승인, 취소, 환불 처리와 정산 관리 기능을 제공합니다. 버전: 8.0.97 - 마지막 업데이트: 2025-02-18', '{"version": "8.0.97", "category": "payment", "keywords": ["fullstack", "nodejs"], "environment": "staging"}');
INSERT INTO public.sync_fixtures VALUES (998, '2025-12-11 16:45:01.536+09', NULL, '검색 엔진 스케줄러 설정', 'SEARCH-0998', 'inactive', 4, true, 'Elasticsearch 기반 검색 엔진입니다. 형태소 분석, 자동완성, 오타 교정, 검색어 추천 기능을 지원합니다. 버전: 9.0.98 - 마지막 업데이트: 2025-03-19', '{"version": "9.0.98", "category": "search", "keywords": ["devops", "postgresql"], "environment": "development"}');
INSERT INTO public.sync_fixtures VALUES (999, '2025-12-11 16:45:01.536+09', NULL, '배치 작업 대용량 데이터 처리', 'BATCH-0999', 'draft', 5, false, '대용량 데이터 배치 처리를 수행합니다. 스케줄링, 청크 처리, 실패 재시도, 진행률 모니터링을 제공합니다. 버전: 10.0.99 - 마지막 업데이트: 2025-04-20', '{"version": "10.0.99", "category": "batch", "keywords": ["infrastructure", "redis"], "environment": "production"}');
INSERT INTO public.sync_fixtures VALUES (1000, '2025-12-11 16:45:01.536+09', NULL, '사용자 인증 JWT 토큰 검증', 'AUTH-1000', 'active', 1, true, 'JWT 기반 사용자 인증을 처리합니다. Access Token과 Refresh Token을 관리하고, 토큰 만료 시 자동 갱신 로직을 포함합니다. 보안을 위해 토큰 블랙리스트 기능도 지원합니다. 버전: 1.0.0 - 마지막 업데이트: 2025-05-21', '{"version": "1.0.0", "category": "authentication", "keywords": ["backend", "typescript"], "environment": "staging"}');


--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tags VALUES (1, '2025-11-25 00:17:02+09', '웹', 'Web', '웹');
INSERT INTO public.tags VALUES (2, '2025-11-25 00:17:02+09', '모바일', 'Mobile', '모바일');
INSERT INTO public.tags VALUES (3, '2025-11-25 00:17:02+09', '백엔드', 'Backend', '백엔드');
INSERT INTO public.tags VALUES (4, '2025-11-25 00:17:02+09', '프론트엔드', 'Frontend', '프론트엔드');
INSERT INTO public.tags VALUES (5, '2025-11-25 00:17:02+09', '데이터', 'Data', '데이터');
INSERT INTO public.tags VALUES (6, '2025-11-25 00:17:02+09', '인프라', 'Infrastructure', '인프라');
INSERT INTO public.tags VALUES (7, '2025-11-25 00:17:02+09', '보안', 'Security', '보안');
INSERT INTO public.tags VALUES (8, '2025-11-25 00:17:02+09', 'UI/UX', 'UI/UX', 'UI/UX');


--
-- Data for Name: two_factors; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users VALUES ('3', '2024-01-03 01:00:00+09', 'park@innovation.com', '박민수', 'password123', '1992-11-09 00:00:00+09', 'normal', '2024-01-13 11:45:00+09', '프론트엔드 개발자로 일하고 있습니다.', true, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('4', '2024-01-04 01:00:00+09', 'choi@digital.com', '최지훈', 'password123', '1985-05-30 00:00:00+09', 'normal', '2024-01-12 16:15:00+09', '데이터 분석 및 마케팅 업무를 담당합니다.', true, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('5', '2024-01-05 01:00:00+09', 'jung@software.com', '정수연', 'password123', '1993-09-14 00:00:00+09', 'normal', '2024-01-11 10:00:00+09', '소프트웨어 아키텍트입니다.', true, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('7', '2024-01-07 01:00:00+09', 'han@global.com', '한미경', 'password123', '1991-04-18 00:00:00+09', 'normal', '2024-01-09 15:40:00+09', '프로젝트 매니저 역할을 하고 있습니다.', false, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('8', '2024-01-08 01:00:00+09', 'kang@innovation.com', '강태우', 'password123', '1989-08-25 00:00:00+09', 'normal', '2024-01-08 08:50:00+09', '풀스택 개발자입니다.', false, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('9', '2024-01-09 01:00:00+09', 'admin@test.com', '관리자', '$2b$10$ZwmVndKfTm121TrW6dZQA..eW9xv.NCwEa3fEn/xqWG948O2ADKL2', '1980-01-01 00:00:00+09', 'admin', '2024-01-07 07:00:00+09', '시스템 관리자입니다.', true, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('10', '2024-01-10 01:00:00+09', 'null1@test.com', '널테스터1', 'password123', NULL, 'normal', NULL, NULL, false, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('11', '2024-01-11 01:00:00+09', 'null2@test.com', '널테스터2', 'password123', NULL, 'normal', NULL, NULL, false, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('12', '2023-11-01 01:00:00+09', 'deleted@test.com', '탈퇴유저', 'password123', '1992-03-10 00:00:00+09', 'normal', '2023-12-20 10:00:00+09', '탈퇴한 사용자입니다.', false, '2024-01-01 10:00:00+09', NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('2', '2024-01-02 01:00:00+09', 'lee@global.com', '이영희', 'password123', '1988-07-22 00:00:00+10', 'normal', '2024-01-14 14:20:00+09', 'UI/UX 디자인 전문가입니다.', true, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('6', '2024-01-06 01:00:00+09', 'yoon@tech.com', '윤대성', 'password123', '1987-12-03 00:00:00+09', 'normal', '2024-01-10 13:25:00+09', '데브옵스 엔지니어로 근무하고 있습니다.', false, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);
INSERT INTO public.users VALUES ('1', '2024-01-01 01:00:00+09', 'kim@tech.com', '김철수', 'password123', '1990-03-15 00:00:00+09', 'normal', '2024-01-15 09:30:00+09', '백엔드 개발을 담당하고 있습니다.', true, NULL, NULL, '2026-01-29 21:45:21.798+09', NULL);


--
-- Data for Name: verifications; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.companies_id_seq', 5, true);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.departments_id_seq', 13, true);


--
-- Name: documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.documents_id_seq', 1, false);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_id_seq', 11, true);


--
-- Name: files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.files_id_seq', 1, false);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.knex_migrations_id_seq', 85, true);


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

SELECT pg_catalog.setval('public.sync_fixtures_id_seq', 1000, true);


--
-- Name: tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tags_id_seq', 8, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 9, true);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


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
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


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
-- Name: passkeys passkeys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_pkey PRIMARY KEY (id);


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
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


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
-- Name: two_factors two_factors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factors
    ADD CONSTRAINT two_factors_pkey PRIMARY KEY (id);


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
-- Name: verifications verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verifications
    ADD CONSTRAINT verifications_pkey PRIMARY KEY (id);


--
-- Name: accounts_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_user_id_idx ON public.accounts USING btree (user_id);


--
-- Name: passkeys_credential_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX passkeys_credential_id_idx ON public.passkeys USING btree (credential_id);


--
-- Name: passkeys_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX passkeys_user_id_idx ON public.passkeys USING btree (user_id);


--
-- Name: projects_name_description_pgroonga_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_name_description_pgroonga_index ON public.projects USING pgroonga ((ARRAY[(name)::text, description])) WITH (tokenizer='TokenMecab');


--
-- Name: projects_textsearchable_index_col_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_textsearchable_index_col_index ON public.projects USING gin (textsearchable_index_col);


--
-- Name: sessions_token_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_token_unique ON public.sessions USING btree (token);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: two_factors_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX two_factors_user_id_idx ON public.two_factors USING btree (user_id);


--
-- Name: verifications_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verifications_identifier_idx ON public.verifications USING btree (identifier);


--
-- Name: accounts accounts_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE RESTRICT ON DELETE CASCADE;


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
-- Name: passkeys passkeys_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE RESTRICT ON DELETE CASCADE;


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
-- Name: sessions sessions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: two_factors two_factors_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factors
    ADD CONSTRAINT two_factors_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 31QXyO104WxKd3MUyMTZiOXFucoy33hifEbEG9uVCYOYWehPoP3KfAKmd0rPADN

