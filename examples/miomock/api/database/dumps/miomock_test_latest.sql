--
-- PostgreSQL database dump
--

\restrict TlfDZdoBBJMBRfcbfcob1pwAgXBVTNuZiDtb2qJJXJgHUhXcRPH3m8iCwVtnOrB

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
    name text NOT NULL,
    uuid uuid
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
    uuid uuid
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
    notes text,
    uuid uuid
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
    url character varying(255) NOT NULL,
    uuid uuid
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
    tag_id integer NOT NULL,
    uuid uuid
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
    image_urls jsonb,
    uuid uuid
);


--
-- Name: projects__employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects__employees (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    project_id integer NOT NULL,
    uuid uuid
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
    tags jsonb,
    uuid uuid
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
    name text NOT NULL,
    uuid uuid
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
    deleted_at timestamp with time zone,
    uuid uuid
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

INSERT INTO public.companies VALUES (1, '2025-11-25 00:17:02+09', '테크놀로지 주식회사', 'ceebdec6-4253-4c24-a0cc-a1a0f388b0a2');
INSERT INTO public.companies VALUES (2, '2025-11-25 00:17:02+09', '글로벌 솔루션즈', 'b8a258ca-56b4-4edb-864a-848a65481e62');
INSERT INTO public.companies VALUES (3, '2025-11-25 00:17:02+09', '혁신 IT 기업', 'dea4b551-3e34-40fd-a1df-531117203823');
INSERT INTO public.companies VALUES (4, '2025-11-25 00:17:02+09', '디지털 마케팅 컴퍼니', 'f9393043-5b09-44d2-b8e9-7638962ccf93');
INSERT INTO public.companies VALUES (5, '2025-11-25 00:17:02+09', '소프트웨어 개발 회사', '47a00346-eab5-4a2f-b732-5032e9fba221');


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.departments VALUES (1, '2024-01-01 01:00:00+09', '개발팀', 1, NULL, '55406b83-8858-4a6e-8ce2-cc7ca589106f');
INSERT INTO public.departments VALUES (2, '2024-01-01 02:00:00+09', '디자인팀', 1, NULL, '307014e5-9307-42f8-b6ef-15d036af60d7');
INSERT INTO public.departments VALUES (3, '2024-01-02 01:00:00+09', '백엔드팀', 1, 1, '47996e26-8fed-472a-a6f8-8e7cc87e9a1f');
INSERT INTO public.departments VALUES (4, '2024-01-02 02:00:00+09', '프론트엔드팀', 1, 1, 'd1596c24-4cd6-437d-a315-d70b26f39b67');
INSERT INTO public.departments VALUES (5, '2024-01-03 01:00:00+09', '기술팀', 2, NULL, '38fbbb46-b91b-4733-b8dd-8fcdb89bf091');
INSERT INTO public.departments VALUES (6, '2024-01-03 02:00:00+09', '마케팅팀', 2, NULL, 'ba56bbdd-ea69-4fef-aae3-472bc88a37b5');
INSERT INTO public.departments VALUES (7, '2024-01-04 01:00:00+09', '연구개발팀', 3, NULL, '76ffa378-0129-4731-8f76-319167273b51');
INSERT INTO public.departments VALUES (8, '2024-01-04 02:00:00+09', '품질관리팀', 3, NULL, 'b7cd4a00-2e44-4c34-8bd4-4a8264d6f861');
INSERT INTO public.departments VALUES (9, '2024-01-05 01:00:00+09', '데이터팀', 4, NULL, '7487fae6-7588-4cc9-a4e4-962855a4f021');
INSERT INTO public.departments VALUES (10, '2024-01-06 01:00:00+09', '아키텍처팀', 5, NULL, 'e3d79aab-cab6-4a56-880e-ed2b17f522a8');
INSERT INTO public.departments VALUES (11, '2024-01-06 02:00:00+09', '인프라팀', 5, NULL, 'e76f036e-6c38-42e5-8621-b8c705db6be4');
INSERT INTO public.departments VALUES (12, '2024-01-07 01:00:00+09', '빈부서A', 1, NULL, 'adb1cd2c-516a-4b91-8f2e-b11cd6088199');
INSERT INTO public.departments VALUES (13, '2024-01-07 02:00:00+09', '빈부서B', 2, NULL, '035ce1d7-a4b3-43c1-ac89-df70de6e0498');


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.employees VALUES (1, '2024-01-01 01:00:00+09', 1, 3, 'EMP001', 75000.00, '2020-03-01 00:00:00+09', '백엔드 리드 개발자', 'e2adb753-d9b3-4aff-a8cc-858afe070e3c');
INSERT INTO public.employees VALUES (2, '2024-01-02 01:00:00+09', 2, 2, 'EMP002', 65000.00, '2019-07-15 00:00:00+09', 'UI/UX 디자이너', '60328aa5-b3b0-4a29-a77c-f63ad17cec2f');
INSERT INTO public.employees VALUES (3, '2024-01-03 01:00:00+09', 3, 4, 'EMP003', 70000.00, '2021-01-10 00:00:00+09', '프론트엔드 개발자', '4951b57a-b48a-4aa3-811d-9a2ac9b438b1');
INSERT INTO public.employees VALUES (4, '2024-01-04 01:00:00+09', 4, 9, 'EMP004', 60000.00, '2022-05-20 00:00:00+09', NULL, '41cb41f2-568a-43b4-a7a1-52dae65b094d');
INSERT INTO public.employees VALUES (5, '2024-01-05 01:00:00+09', 5, 10, 'EMP005', 85000.00, '2018-09-01 00:00:00+09', '시니어 아키텍트', '545ba923-0a07-4d05-bfd9-12b1931934ad');
INSERT INTO public.employees VALUES (6, '2024-01-06 01:00:00+09', 6, 11, 'EMP006', 72000.00, '2020-11-15 00:00:00+09', '데브옵스 엔지니어', '8d63fe48-1d04-4050-ac40-a047146ac50e');
INSERT INTO public.employees VALUES (7, '2024-01-07 01:00:00+09', 7, 6, 'EMP007', 68000.00, '2021-03-20 00:00:00+09', NULL, 'dcb5cb16-a67c-4585-983c-d84b04cb29a0');
INSERT INTO public.employees VALUES (8, '2024-01-08 01:00:00+09', 8, 5, 'EMP008', 78000.00, '2019-12-01 00:00:00+09', '풀스택 개발자', '8047676e-40b8-45a4-8d1e-1a228af9b0b2');
INSERT INTO public.employees VALUES (9, '2024-01-09 01:00:00+09', 9, 1, 'EMP009', 95000.00, '2015-01-01 00:00:00+09', '시스템 관리자', 'c9e827b8-d3d6-4dc3-872b-6adbf11a543c');
INSERT INTO public.employees VALUES (10, '2024-01-10 01:00:00+09', 10, 7, 'EMP010', 55000.00, NULL, NULL, '7e6e56b3-cce8-40a5-aabe-71a4c0c377d3');
INSERT INTO public.employees VALUES (11, '2024-01-11 01:00:00+09', 11, 8, 'EMP011', 58000.00, NULL, NULL, '8240b236-2ac8-426a-9d31-34e9bebd27e0');


--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: knex_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.knex_migrations VALUES (1, '20251204170803_create__companies.ts', 1, '2025-12-04 19:00:42.216+09');
INSERT INTO public.knex_migrations VALUES (2, '20251204170804_create__departments.ts', 1, '2025-12-04 19:00:42.22+09');
INSERT INTO public.knex_migrations VALUES (3, '20251204170805_create__employees.ts', 1, '2025-12-04 19:00:42.227+09');
INSERT INTO public.knex_migrations VALUES (4, '20251204170806_create__files.ts', 1, '2025-12-04 19:00:42.233+09');
INSERT INTO public.knex_migrations VALUES (5, '20251204170807_create__projects.ts', 1, '2025-12-04 19:00:42.238+09');
INSERT INTO public.knex_migrations VALUES (6, '20251204170808_create__sync_fixtures.ts', 1, '2025-12-04 19:00:42.242+09');
INSERT INTO public.knex_migrations VALUES (7, '20251204170809_create__tags.ts', 1, '2025-12-04 19:00:42.247+09');
INSERT INTO public.knex_migrations VALUES (8, '20251204170810_create__users.ts', 1, '2025-12-04 19:00:42.258+09');
INSERT INTO public.knex_migrations VALUES (9, '20251204170811_create__projects__employees.ts', 1, '2025-12-04 19:00:42.262+09');
INSERT INTO public.knex_migrations VALUES (10, '20251204170812_create__project_tags.ts', 1, '2025-12-04 19:00:42.268+09');
INSERT INTO public.knex_migrations VALUES (11, '20251204170813_foreign__departments__company_id_parent_id.ts', 1, '2025-12-04 19:00:42.276+09');
INSERT INTO public.knex_migrations VALUES (12, '20251204170814_foreign__employees__user_id_department_id.ts', 1, '2025-12-04 19:00:42.28+09');
INSERT INTO public.knex_migrations VALUES (13, '20251204170815_foreign__projects__employees__employee_id_project_id.ts', 1, '2025-12-04 19:00:42.282+09');
INSERT INTO public.knex_migrations VALUES (14, '20251204170816_foreign__project_tags__project_id_tag_id.ts', 1, '2025-12-04 19:00:42.285+09');


--
-- Data for Name: knex_migrations_lock; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.knex_migrations_lock VALUES (1, 0);


--
-- Data for Name: project_tags; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.project_tags VALUES (1, 1, 1, 'b426c702-6938-4077-a31e-5698c8893562');
INSERT INTO public.project_tags VALUES (2, 1, 3, 'a468978f-b705-461d-ac7b-83beb4b39be9');
INSERT INTO public.project_tags VALUES (3, 1, 4, 'f1a2c8bd-f702-4da5-a605-a7bfa06c140d');
INSERT INTO public.project_tags VALUES (4, 2, 2, '9a277547-6222-4c79-b916-d0e3c890c3f1');
INSERT INTO public.project_tags VALUES (5, 2, 4, 'b0048607-bdfe-43bb-8ff8-ffa420fe5759');
INSERT INTO public.project_tags VALUES (6, 3, 5, '01eaebaf-9e82-43fb-8aeb-5fe9906bdd7c');
INSERT INTO public.project_tags VALUES (7, 3, 3, '26c88ca7-6917-427f-9bb4-7b6ede2e3952');
INSERT INTO public.project_tags VALUES (8, 4, 3, 'ce88ae34-ab3f-4b3d-a39d-60cc9183f200');
INSERT INTO public.project_tags VALUES (9, 4, 6, '623106f9-71ff-4161-a723-190654b8ccf3');
INSERT INTO public.project_tags VALUES (10, 4, 7, '6c23ebb6-bbff-46c7-9b24-9f8878c67679');
INSERT INTO public.project_tags VALUES (11, 5, 8, '6411e1ec-0de1-4cb4-8ec6-298dea1b390a');
INSERT INTO public.project_tags VALUES (12, 5, 4, 'e3dbbc7e-8dc5-4840-9c11-cdf90bd3fb89');
INSERT INTO public.project_tags VALUES (13, 6, 7, 'fca05b5e-ce75-4d52-aae1-fb0dfaad6a60');
INSERT INTO public.project_tags VALUES (14, 7, 3, 'f56e63fb-64d6-4f8c-b5aa-fe88f82971e8');
INSERT INTO public.project_tags VALUES (15, 7, 6, 'fe51d4dc-8286-4324-902c-3fa9b00c96b1');


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.projects VALUES (1, '2024-01-01 01:00:00+09', '웹 애플리케이션 리뉴얼', 'in_progress', '기존 웹사이트를 최신 기술스택으로 리뉴얼하는 프로젝트입니다.', 150000.00, '2024-06-30 23:59:59+09', NULL, '51958c24-a670-49a0-a461-5fbede870e3c');
INSERT INTO public.projects VALUES (2, '2024-01-02 01:00:00+09', '모바일 앱 개발', 'planning', '새로운 모바일 서비스를 위한 앱 개발 프로젝트입니다.', 200000.00, '2024-08-31 23:59:59+09', NULL, '475da5a4-649c-486e-b094-aad103300ca8');
INSERT INTO public.projects VALUES (3, '2023-11-01 01:00:00+09', '데이터 분석 시스템', 'completed', '고객 데이터 분석을 위한 대시보드 시스템 구축 프로젝트입니다.', 80000.00, '2024-03-31 23:59:59+09', NULL, '5d4756df-deef-4e3a-a733-21b6c9cd3f7a');
INSERT INTO public.projects VALUES (4, '2024-01-03 01:00:00+09', 'API 서버 마이그레이션', 'in_progress', '레거시 API 서버를 클라우드로 마이그레이션하는 작업입니다.', 120000.00, '2024-05-31 23:59:59+09', NULL, '4431d8c9-f95e-467f-91a7-89eb964d63d4');
INSERT INTO public.projects VALUES (5, '2024-01-05 01:00:00+09', 'UI/UX 개선', 'planning', '사용자 경험 향상을 위한 인터페이스 개선 프로젝트입니다.', NULL, NULL, NULL, '18e41a5b-6b5c-4285-866f-dac5191d3ef0');
INSERT INTO public.projects VALUES (6, '2023-12-01 01:00:00+09', '보안 강화', 'cancelled', '시스템 보안성 강화를 위한 프로젝트였으나 우선순위 변경으로 취소되었습니다.', 50000.00, NULL, NULL, 'ebc49083-5c26-4691-a654-c909a804b3a4');
INSERT INTO public.projects VALUES (7, '2024-01-08 01:00:00+09', '레거시 시스템 개선', 'in_progress', '오래된 시스템을 현대화하는 프로젝트입니다.', 180000.00, '2024-12-31 23:59:59+09', NULL, '36fe2aaf-cf1d-4c0d-a717-99c399bb36b7');
INSERT INTO public.projects VALUES (8, '2023-10-01 01:00:00+09', '내부 도구 개발', 'completed', '직원들의 생산성 향상을 위한 내부 도구입니다.', NULL, NULL, NULL, '6f9b142d-c89d-4c32-a6e2-7b60973de2b1');


--
-- Data for Name: projects__employees; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.projects__employees VALUES (1, 1, 1, 'ff3ec4ca-ca0b-4139-bc79-5d0c4e1d63b9');
INSERT INTO public.projects__employees VALUES (2, 2, 1, 'ef6926a6-7214-48a9-9d55-dcedb5d4e176');
INSERT INTO public.projects__employees VALUES (3, 3, 1, '527b230e-57ac-47d5-a455-0f2339339d96');
INSERT INTO public.projects__employees VALUES (4, 6, 1, 'a2f77836-2f1e-457f-b1ab-463f306a9c3b');
INSERT INTO public.projects__employees VALUES (5, 3, 2, 'd73bca6d-5a88-48d8-98a2-233be6533542');
INSERT INTO public.projects__employees VALUES (6, 4, 2, '89efe552-2be6-49bc-8bb5-ff493fc32d0e');
INSERT INTO public.projects__employees VALUES (7, 8, 2, '356b26a2-7da8-4abb-b0aa-2fdcddd804c5');
INSERT INTO public.projects__employees VALUES (8, 4, 3, '3c5cc3cd-0a44-4e5e-b352-7281845763cf');
INSERT INTO public.projects__employees VALUES (9, 7, 3, 'ad7cc826-777b-4ae5-bf9e-0ad3c25f2d84');
INSERT INTO public.projects__employees VALUES (10, 1, 4, '1fb87ffa-e61d-47ee-b4aa-c08c25acedf1');
INSERT INTO public.projects__employees VALUES (11, 5, 4, '7d6e6c64-35c3-4403-9d53-06a8cfd5c70e');
INSERT INTO public.projects__employees VALUES (12, 6, 4, '45b15d4c-d474-4953-814a-49be79f17b5f');
INSERT INTO public.projects__employees VALUES (13, 7, 4, 'ea712628-1b91-4926-9c88-6eb43ec5ae68');
INSERT INTO public.projects__employees VALUES (14, 8, 4, '84170e37-cb9b-4784-9e47-5f73362ebc0d');
INSERT INTO public.projects__employees VALUES (15, 2, 5, 'a030d7b7-200a-4128-8288-b735c7478d4c');
INSERT INTO public.projects__employees VALUES (16, 3, 5, 'a4a1e062-5967-4fd4-bc66-6e5a8280460f');
INSERT INTO public.projects__employees VALUES (17, 5, 6, 'ea87c856-f5c5-4e29-bf78-3be8e830a98d');
INSERT INTO public.projects__employees VALUES (18, 8, 6, 'd83f9137-38cb-4b64-a7d0-be289f26cf66');
INSERT INTO public.projects__employees VALUES (19, 1, 7, '086113f3-5694-4e6b-b7d4-91f6d69bd508');
INSERT INTO public.projects__employees VALUES (20, 7, 8, '33b14212-2ab2-4d28-bd7d-6b9985b43435');


--
-- Data for Name: sync_fixtures; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tags VALUES (1, '2025-11-25 00:17:02+09', '웹', '9fe9a4e6-7efa-46de-a11e-ebb6ea5ce9b3');
INSERT INTO public.tags VALUES (2, '2025-11-25 00:17:02+09', '모바일', '1ce03c21-66bc-4b34-91e0-d203766fdde2');
INSERT INTO public.tags VALUES (3, '2025-11-25 00:17:02+09', '백엔드', 'a3520e64-3fae-4307-9a30-236a9e707599');
INSERT INTO public.tags VALUES (4, '2025-11-25 00:17:02+09', '프론트엔드', '20e17e6c-d0de-4457-a589-1bd76c4487bf');
INSERT INTO public.tags VALUES (5, '2025-11-25 00:17:02+09', '데이터', 'ed7b48a6-c483-4838-b76b-7d1951f5eedb');
INSERT INTO public.tags VALUES (6, '2025-11-25 00:17:02+09', '인프라', '85dfa63c-9e4c-4869-8950-7bd372814db2');
INSERT INTO public.tags VALUES (7, '2025-11-25 00:17:02+09', '보안', '28097192-25ca-4b90-a69b-540ab7fdc229');
INSERT INTO public.tags VALUES (8, '2025-11-25 00:17:02+09', 'UI/UX', 'b0a7c1ad-b2ec-4a48-b824-7e4603f2003a');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users VALUES (1, '2024-01-01 01:00:00+09', 'kim@tech.com', '김철수', 'password123', '1990-03-15 00:00:00+09', 'normal', '2024-01-15 09:30:00+09', '백엔드 개발을 담당하고 있습니다.', true, NULL, 'f90e44d9-1b23-460e-8042-cb57c00e2782');
INSERT INTO public.users VALUES (2, '2024-01-02 01:00:00+09', 'lee@global.com', '이영희', 'password123', '1988-07-22 00:00:00+10', 'normal', '2024-01-14 14:20:00+09', 'UI/UX 디자인 전문가입니다.', true, NULL, '8862f150-aff3-4f5d-8d95-5cf62c602ef1');
INSERT INTO public.users VALUES (3, '2024-01-03 01:00:00+09', 'park@innovation.com', '박민수', 'password123', '1992-11-09 00:00:00+09', 'normal', '2024-01-13 11:45:00+09', '프론트엔드 개발자로 일하고 있습니다.', true, NULL, '8a5fc12c-1e66-4160-9ddd-b49f3b475fc8');
INSERT INTO public.users VALUES (4, '2024-01-04 01:00:00+09', 'choi@digital.com', '최지훈', 'password123', '1985-05-30 00:00:00+09', 'normal', '2024-01-12 16:15:00+09', '데이터 분석 및 마케팅 업무를 담당합니다.', true, NULL, '4adba778-bb70-46ce-8259-ab37cf291874');
INSERT INTO public.users VALUES (5, '2024-01-05 01:00:00+09', 'jung@software.com', '정수연', 'password123', '1993-09-14 00:00:00+09', 'normal', '2024-01-11 10:00:00+09', '소프트웨어 아키텍트입니다.', true, NULL, '2c78be48-20ff-45f3-b25d-ce847228a9f8');
INSERT INTO public.users VALUES (6, '2024-01-06 01:00:00+09', 'yoon@tech.com', '윤대성', 'password123', '1987-12-03 00:00:00+09', 'normal', '2024-01-10 13:25:00+09', '데브옵스 엔지니어로 근무하고 있습니다.', false, NULL, '0f045e35-cb53-482c-aaf1-35288687bd97');
INSERT INTO public.users VALUES (7, '2024-01-07 01:00:00+09', 'han@global.com', '한미경', 'password123', '1991-04-18 00:00:00+09', 'normal', '2024-01-09 15:40:00+09', '프로젝트 매니저 역할을 하고 있습니다.', false, NULL, 'a5ce037a-5780-4e47-9dbc-94a6e68c1db6');
INSERT INTO public.users VALUES (8, '2024-01-08 01:00:00+09', 'kang@innovation.com', '강태우', 'password123', '1989-08-25 00:00:00+09', 'normal', '2024-01-08 08:50:00+09', '풀스택 개발자입니다.', false, NULL, '9f80e6fd-0282-4596-9426-431beb02c83c');
INSERT INTO public.users VALUES (9, '2024-01-09 01:00:00+09', 'admin@test.com', '관리자', '$2b$10$ZwmVndKfTm121TrW6dZQA..eW9xv.NCwEa3fEn/xqWG948O2ADKL2', '1980-01-01 00:00:00+09', 'admin', '2024-01-07 07:00:00+09', '시스템 관리자입니다.', true, NULL, '57765953-e039-4a6f-bc60-49319405603a');
INSERT INTO public.users VALUES (10, '2024-01-10 01:00:00+09', 'null1@test.com', '널테스터1', 'password123', NULL, 'normal', NULL, NULL, false, NULL, 'b2a903ff-d74c-4ae1-9d85-ebe47184b962');
INSERT INTO public.users VALUES (11, '2024-01-11 01:00:00+09', 'null2@test.com', '널테스터2', 'password123', NULL, 'normal', NULL, NULL, false, NULL, 'fc7811d3-ce47-4f6b-9a1d-48367ff17c25');
INSERT INTO public.users VALUES (12, '2023-11-01 01:00:00+09', 'deleted@test.com', '탈퇴유저', 'password123', '1992-03-10 00:00:00+09', 'normal', '2023-12-20 10:00:00+09', '탈퇴한 사용자입니다.', false, '2024-01-01 10:00:00+09', '15025496-494b-447f-adfc-977c605109d8');


--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.companies_id_seq', 76, true);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.departments_id_seq', 14, true);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_id_seq', 12, true);


--
-- Name: files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.files_id_seq', 1, false);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.knex_migrations_id_seq', 14, true);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.knex_migrations_lock_index_seq', 1, true);


--
-- Name: project_tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.project_tags_id_seq', 16, true);


--
-- Name: projects__employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.projects__employees_id_seq', 21, true);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.projects_id_seq', 9, true);


--
-- Name: sync_fixtures_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sync_fixtures_id_seq', 1, false);


--
-- Name: tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tags_id_seq', 9, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 736, true);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_uuid_unique UNIQUE (uuid);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: departments departments_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_uuid_unique UNIQUE (uuid);


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
-- Name: employees employees_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_uuid_unique UNIQUE (uuid);


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
-- Name: files files_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_uuid_unique UNIQUE (uuid);


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
-- Name: project_tags project_tags_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tags
    ADD CONSTRAINT project_tags_uuid_unique UNIQUE (uuid);


--
-- Name: projects__employees projects__employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects__employees
    ADD CONSTRAINT projects__employees_pkey PRIMARY KEY (id);


--
-- Name: projects__employees projects__employees_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects__employees
    ADD CONSTRAINT projects__employees_uuid_unique UNIQUE (uuid);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_uuid_unique UNIQUE (uuid);


--
-- Name: sync_fixtures sync_fixtures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_fixtures
    ADD CONSTRAINT sync_fixtures_pkey PRIMARY KEY (id);


--
-- Name: sync_fixtures sync_fixtures_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_fixtures
    ADD CONSTRAINT sync_fixtures_uuid_unique UNIQUE (uuid);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tags tags_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_uuid_unique UNIQUE (uuid);


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
-- Name: users users_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_uuid_unique UNIQUE (uuid);


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

\unrestrict TlfDZdoBBJMBRfcbfcob1pwAgXBVTNuZiDtb2qJJXJgHUhXcRPH3m8iCwVtnOrB

