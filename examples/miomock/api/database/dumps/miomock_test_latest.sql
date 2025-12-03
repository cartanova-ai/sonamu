
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `miomock_test` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `miomock_test`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `companies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `name` varchar(255) NOT NULL,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `companies_uuid_unique` (`uuid`)
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `companies` WRITE;
/*!40000 ALTER TABLE `companies` DISABLE KEYS */;
INSERT INTO `companies` (`id`, `created_at`, `name`, `uuid`) VALUES (1,'2025-11-25 00:17:02','테크놀로지 주식회사',NULL),(2,'2025-11-25 00:17:02','글로벌 솔루션즈',NULL),(3,'2025-11-25 00:17:02','혁신 IT 기업',NULL),(4,'2025-11-25 00:17:02','디지털 마케팅 컴퍼니',NULL),(5,'2025-11-25 00:17:02','소프트웨어 개발 회사',NULL);
/*!40000 ALTER TABLE `companies` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `name` varchar(128) NOT NULL,
  `company_id` int unsigned NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `departments_uuid_unique` (`uuid`),
  KEY `departments_company_id_foreign` (`company_id`),
  KEY `departments_parent_id_foreign` (`parent_id`),
  CONSTRAINT `departments_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `departments_parent_id_foreign` FOREIGN KEY (`parent_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `departments` WRITE;
/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
INSERT INTO `departments` (`id`, `created_at`, `name`, `company_id`, `parent_id`, `uuid`) VALUES (1,'2024-01-01 01:00:00','개발팀',1,NULL,NULL),(2,'2024-01-01 02:00:00','디자인팀',1,NULL,NULL),(3,'2024-01-02 01:00:00','백엔드팀',1,1,NULL),(4,'2024-01-02 02:00:00','프론트엔드팀',1,1,NULL),(5,'2024-01-03 01:00:00','기술팀',2,NULL,NULL),(6,'2024-01-03 02:00:00','마케팅팀',2,NULL,NULL),(7,'2024-01-04 01:00:00','연구개발팀',3,NULL,NULL),(8,'2024-01-04 02:00:00','품질관리팀',3,NULL,NULL),(9,'2024-01-05 01:00:00','데이터팀',4,NULL,NULL),(10,'2024-01-06 01:00:00','아키텍처팀',5,NULL,NULL),(11,'2024-01-06 02:00:00','인프라팀',5,NULL,NULL),(12,'2024-01-07 01:00:00','빈부서A',1,NULL,NULL),(13,'2024-01-07 02:00:00','빈부서B',2,NULL,NULL);
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employees` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` int unsigned NOT NULL,
  `department_id` int unsigned DEFAULT NULL,
  `employee_number` varchar(32) NOT NULL,
  `salary` decimal(10,2) DEFAULT NULL,
  `hire_date` date DEFAULT NULL,
  `notes` text,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employees_employee_number_user_id_unique` (`employee_number`,`user_id`),
  UNIQUE KEY `employees_uuid_unique` (`uuid`),
  KEY `employees_user_id_foreign` (`user_id`),
  KEY `employees_department_id_foreign` (`department_id`),
  CONSTRAINT `employees_department_id_foreign` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `employees_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `employees` WRITE;
/*!40000 ALTER TABLE `employees` DISABLE KEYS */;
INSERT INTO `employees` (`id`, `created_at`, `user_id`, `department_id`, `employee_number`, `salary`, `hire_date`, `notes`, `uuid`) VALUES (1,'2024-01-01 01:00:00',1,3,'EMP001',75000.00,'2020-03-01','백엔드 리드 개발자',NULL),(2,'2024-01-02 01:00:00',2,2,'EMP002',65000.00,'2019-07-15','UI/UX 디자이너',NULL),(3,'2024-01-03 01:00:00',3,4,'EMP003',70000.00,'2021-01-10','프론트엔드 개발자',NULL),(4,'2024-01-04 01:00:00',4,9,'EMP004',60000.00,'2022-05-20',NULL,NULL),(5,'2024-01-05 01:00:00',5,10,'EMP005',85000.00,'2018-09-01','시니어 아키텍트',NULL),(6,'2024-01-06 01:00:00',6,11,'EMP006',72000.00,'2020-11-15','데브옵스 엔지니어',NULL),(7,'2024-01-07 01:00:00',7,6,'EMP007',68000.00,'2021-03-20',NULL,NULL),(8,'2024-01-08 01:00:00',8,5,'EMP008',78000.00,'2019-12-01','풀스택 개발자',NULL),(9,'2024-01-09 01:00:00',9,1,'EMP009',95000.00,'2015-01-01','시스템 관리자',NULL),(10,'2024-01-10 01:00:00',10,7,'EMP010',55000.00,NULL,NULL,NULL),(11,'2024-01-11 01:00:00',11,8,'EMP011',58000.00,NULL,NULL,NULL);
/*!40000 ALTER TABLE `employees` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `files` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `mime_type` varchar(128) NOT NULL,
  `name` varchar(128) NOT NULL,
  `url` varchar(255) NOT NULL,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `files_url_unique` (`url`),
  UNIQUE KEY `files_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `files` WRITE;
/*!40000 ALTER TABLE `files` DISABLE KEYS */;
/*!40000 ALTER TABLE `files` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knex_migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `batch` int DEFAULT NULL,
  `migration_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `knex_migrations` WRITE;
/*!40000 ALTER TABLE `knex_migrations` DISABLE KEYS */;
INSERT INTO `knex_migrations` (`id`, `name`, `batch`, `migration_time`) VALUES (1,'20251124233557_create__companies.ts',1,'2025-11-24 14:36:02'),(2,'20251124233558_create__departments.ts',1,'2025-11-24 14:36:02'),(3,'20251124233559_create__employees.ts',1,'2025-11-24 14:36:02'),(4,'20251124233600_create__files.ts',1,'2025-11-24 14:36:02'),(5,'20251124233601_create__projects.ts',1,'2025-11-24 14:36:02'),(6,'20251124233602_create__tags.ts',1,'2025-11-24 14:36:02'),(7,'20251124233603_create__users.ts',1,'2025-11-24 14:36:02'),(8,'20251124233604_create__projects__employees.ts',1,'2025-11-24 14:36:02'),(9,'20251124233605_create__project_tags.ts',1,'2025-11-24 14:36:02'),(10,'20251124233606_foreign__departments__company_id_parent_id.ts',1,'2025-11-24 14:36:02'),(11,'20251124233607_foreign__employees__user_id_department_id.ts',1,'2025-11-24 14:36:02'),(12,'20251124233608_foreign__projects__employees__employee_id_project_id.ts',1,'2025-11-24 14:36:02'),(13,'20251124233609_foreign__project_tags__project_id_tag_id.ts',1,'2025-11-24 14:36:02'),(14,'20251127145948_alter_users.ts',2,'2025-11-29 12:20:30'),(15,'20251128133442_create__sync_fixtures.ts',2,'2025-11-29 12:20:30'),(16,'20251202124133_alter_employees.ts',3,'2025-12-02 03:41:39');
/*!40000 ALTER TABLE `knex_migrations` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knex_migrations_lock` (
  `index` int unsigned NOT NULL AUTO_INCREMENT,
  `is_locked` int DEFAULT NULL,
  PRIMARY KEY (`index`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `knex_migrations_lock` WRITE;
/*!40000 ALTER TABLE `knex_migrations_lock` DISABLE KEYS */;
INSERT INTO `knex_migrations_lock` (`index`, `is_locked`) VALUES (1,0);
/*!40000 ALTER TABLE `knex_migrations_lock` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_tags` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int unsigned NOT NULL,
  `tag_id` int unsigned NOT NULL,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_tags_uuid_unique` (`uuid`),
  KEY `project_tags_project_id_foreign` (`project_id`),
  KEY `project_tags_tag_id_foreign` (`tag_id`),
  CONSTRAINT `project_tags_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `project_tags_tag_id_foreign` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `project_tags` WRITE;
/*!40000 ALTER TABLE `project_tags` DISABLE KEYS */;
INSERT INTO `project_tags` (`id`, `project_id`, `tag_id`, `uuid`) VALUES (1,1,1,NULL),(2,1,3,NULL),(3,1,4,NULL),(4,2,2,NULL),(5,2,4,NULL),(6,3,5,NULL),(7,3,3,NULL),(8,4,3,NULL),(9,4,6,NULL),(10,4,7,NULL),(11,5,8,NULL),(12,5,4,NULL),(13,6,7,NULL),(14,7,3,NULL),(15,7,6,NULL);
/*!40000 ALTER TABLE `project_tags` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `name` varchar(255) NOT NULL,
  `status` varchar(32) NOT NULL,
  `description` longtext,
  `budget` decimal(12,2) DEFAULT NULL,
  `deadline` datetime DEFAULT NULL,
  `image_urls` json DEFAULT NULL,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `projects_uuid_unique` (`uuid`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
INSERT INTO `projects` (`id`, `created_at`, `name`, `status`, `description`, `budget`, `deadline`, `image_urls`, `uuid`) VALUES (1,'2024-01-01 01:00:00','웹 애플리케이션 리뉴얼','in_progress','기존 웹사이트를 최신 기술스택으로 리뉴얼하는 프로젝트입니다.',150000.00,'2024-06-30 23:59:59',NULL,NULL),(2,'2024-01-02 01:00:00','모바일 앱 개발','planning','새로운 모바일 서비스를 위한 앱 개발 프로젝트입니다.',200000.00,'2024-08-31 23:59:59',NULL,NULL),(3,'2023-11-01 01:00:00','데이터 분석 시스템','completed','고객 데이터 분석을 위한 대시보드 시스템 구축 프로젝트입니다.',80000.00,'2024-03-31 23:59:59',NULL,NULL),(4,'2024-01-03 01:00:00','API 서버 마이그레이션','in_progress','레거시 API 서버를 클라우드로 마이그레이션하는 작업입니다.',120000.00,'2024-05-31 23:59:59',NULL,NULL),(5,'2024-01-05 01:00:00','UI/UX 개선','planning','사용자 경험 향상을 위한 인터페이스 개선 프로젝트입니다.',NULL,NULL,NULL,NULL),(6,'2023-12-01 01:00:00','보안 강화','cancelled','시스템 보안성 강화를 위한 프로젝트였으나 우선순위 변경으로 취소되었습니다.',50000.00,NULL,NULL,NULL),(7,'2024-01-08 01:00:00','레거시 시스템 개선','in_progress','오래된 시스템을 현대화하는 프로젝트입니다.',180000.00,'2024-12-31 23:59:59',NULL,NULL),(8,'2023-10-01 01:00:00','내부 도구 개발','completed','직원들의 생산성 향상을 위한 내부 도구입니다.',NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects__employees` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` int unsigned NOT NULL,
  `project_id` int unsigned NOT NULL,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `projects__employees_uuid_unique` (`uuid`),
  KEY `projects__employees_employee_id_foreign` (`employee_id`),
  KEY `projects__employees_project_id_foreign` (`project_id`),
  CONSTRAINT `projects__employees_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `projects__employees_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `projects__employees` WRITE;
/*!40000 ALTER TABLE `projects__employees` DISABLE KEYS */;
INSERT INTO `projects__employees` (`id`, `employee_id`, `project_id`, `uuid`) VALUES (1,1,1,NULL),(2,2,1,NULL),(3,3,1,NULL),(4,6,1,NULL),(5,3,2,NULL),(6,4,2,NULL),(7,8,2,NULL),(8,4,3,NULL),(9,7,3,NULL),(10,1,4,NULL),(11,5,4,NULL),(12,6,4,NULL),(13,7,4,NULL),(14,8,4,NULL),(15,2,5,NULL),(16,3,5,NULL),(17,5,6,NULL),(18,8,6,NULL),(19,1,7,NULL),(20,7,8,NULL);
/*!40000 ALTER TABLE `projects__employees` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sync_fixtures` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `name` varchar(128) NOT NULL,
  `code` varchar(32) DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `priority` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `description` text,
  `tags` json DEFAULT NULL,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sync_fixtures_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `sync_fixtures` WRITE;
/*!40000 ALTER TABLE `sync_fixtures` DISABLE KEYS */;
/*!40000 ALTER TABLE `sync_fixtures` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tags` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `name` varchar(30) NOT NULL,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tags_uuid_unique` (`uuid`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `tags` WRITE;
/*!40000 ALTER TABLE `tags` DISABLE KEYS */;
INSERT INTO `tags` (`id`, `created_at`, `name`, `uuid`) VALUES (1,'2025-11-25 00:17:02','웹',NULL),(2,'2025-11-25 00:17:02','모바일',NULL),(3,'2025-11-25 00:17:02','백엔드',NULL),(4,'2025-11-25 00:17:02','프론트엔드',NULL),(5,'2025-11-25 00:17:02','데이터',NULL),(6,'2025-11-25 00:17:02','인프라',NULL),(7,'2025-11-25 00:17:02','보안',NULL),(8,'2025-11-25 00:17:02','UI/UX',NULL);
/*!40000 ALTER TABLE `tags` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `email` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `birth_date` date DEFAULT NULL,
  `role` varchar(30) NOT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `bio` text,
  `is_verified` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  `uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  UNIQUE KEY `users_uuid_unique` (`uuid`),
  FULLTEXT KEY `users_bio_index` (`bio`) /*!50100 WITH PARSER `ngram` */ 
) ENGINE=InnoDB AUTO_INCREMENT=736 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` (`id`, `created_at`, `email`, `username`, `password`, `birth_date`, `role`, `last_login_at`, `bio`, `is_verified`, `deleted_at`, `uuid`) VALUES (1,'2024-01-01 01:00:00','kim@tech.com','김철수','password123','1990-03-15','normal','2024-01-15 09:30:00','백엔드 개발을 담당하고 있습니다.',1,NULL,NULL),(2,'2024-01-02 01:00:00','lee@global.com','이영희','password123','1988-07-22','normal','2024-01-14 14:20:00','UI/UX 디자인 전문가입니다.',1,NULL,NULL),(3,'2024-01-03 01:00:00','park@innovation.com','박민수','password123','1992-11-09','normal','2024-01-13 11:45:00','프론트엔드 개발자로 일하고 있습니다.',1,NULL,NULL),(4,'2024-01-04 01:00:00','choi@digital.com','최지훈','password123','1985-05-30','normal','2024-01-12 16:15:00','데이터 분석 및 마케팅 업무를 담당합니다.',1,NULL,NULL),(5,'2024-01-05 01:00:00','jung@software.com','정수연','password123','1993-09-14','normal','2024-01-11 10:00:00','소프트웨어 아키텍트입니다.',1,NULL,NULL),(6,'2024-01-06 01:00:00','yoon@tech.com','윤대성','password123','1987-12-03','normal','2024-01-10 13:25:00','데브옵스 엔지니어로 근무하고 있습니다.',0,NULL,NULL),(7,'2024-01-07 01:00:00','han@global.com','한미경','password123','1991-04-18','normal','2024-01-09 15:40:00','프로젝트 매니저 역할을 하고 있습니다.',0,NULL,NULL),(8,'2024-01-08 01:00:00','kang@innovation.com','강태우','password123','1989-08-25','normal','2024-01-08 08:50:00','풀스택 개발자입니다.',0,NULL,NULL),(9,'2024-01-09 01:00:00','admin@test.com','관리자','$2b$10$ZwmVndKfTm121TrW6dZQA..eW9xv.NCwEa3fEn/xqWG948O2ADKL2','1980-01-01','admin','2024-01-07 07:00:00','시스템 관리자입니다.',1,NULL,NULL),(10,'2024-01-10 01:00:00','null1@test.com','널테스터1','password123',NULL,'normal',NULL,NULL,0,NULL,NULL),(11,'2024-01-11 01:00:00','null2@test.com','널테스터2','password123',NULL,'normal',NULL,NULL,0,NULL,NULL),(12,'2023-11-01 01:00:00','deleted@test.com','탈퇴유저','password123','1992-03-10','normal','2023-12-20 10:00:00','탈퇴한 사용자입니다.',0,'2024-01-01 10:00:00',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

