/* 
 * 컨테이너가 시작되고 데이터베이스가 준비된 직후에 실행될 스크립트입니다.
 * 이 스크립트는 데이터베이스를 생성하는 것 까지만 담당합니다.
 * 이후 DDL 추가는 Sonamu UI의 DB Migration 기능을 사용해주세요.
 */

-- PostgreSQL은 템플릿 데이터베이스에서 실행되므로, 추가 데이터베이스만 생성
CREATE DATABASE miomock_fixture_remote;
CREATE DATABASE miomock_test;

-- 각 데이터베이스에 vector 확장 설치
-- miomock (현재 연결된 DB)
CREATE EXTENSION IF NOT EXISTS vector;

-- miomock_fixture_remote
CREATE EXTENSION IF NOT EXISTS vector;

-- miomock_test
CREATE EXTENSION IF NOT EXISTS vector;