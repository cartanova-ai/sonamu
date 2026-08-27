/**
 * Fixture 생성 시 사용할 Faker 매핑 테이블입니다.
 *
 * 필드명이나 타입에 따라 적절한 Faker 함수를 선택하여,
 * 현실적이고 의미있는 테스트 데이터를 생성하기 위함입니다.
 *
 * 예: salary 필드는 0~1000이 아닌 30M~150M 범위로 생성
 */
export type FakerMappingConfig = {
  faker: string;
  comment?: string;
};

export type FakerMappings = {
  [locale: string]: {
    field_patterns: Record<string, FakerMappingConfig>;
    type_defaults: Record<string, FakerMappingConfig>;
  };
};

export const fakerMappings = {
  ko: {
    field_patterns: {
      email: {
        faker: "faker.internet.email()",
        comment: "이메일 주소",
      },
      username: {
        faker: "fakerKO.person.fullName()",
        comment: "한국어 이름",
      },
      name: {
        faker: "fakerKO.person.fullName()",
        comment: "한국어 이름",
      },
      firstname: {
        faker: "fakerKO.person.firstName()",
        comment: "이름",
      },
      lastname: {
        faker: "fakerKO.person.lastName()",
        comment: "성",
      },
      phone: {
        faker: "faker.phone.number()",
        comment: "전화번호",
      },
      mobile: {
        faker: "faker.phone.number()",
        comment: "휴대폰",
      },
      address: {
        faker: "fakerKO.location.streetAddress()",
        comment: "주소",
      },
      city: {
        faker: "fakerKO.location.city()",
        comment: "도시",
      },
      country: {
        faker: "fakerKO.location.country()",
        comment: "국가",
      },
      zipcode: {
        faker: "faker.location.zipCode()",
        comment: "우편번호",
      },
      company: {
        faker: "fakerKO.company.name()",
        comment: "회사명",
      },
      department: {
        faker: "fakerKO.commerce.department()",
        comment: "부서명",
      },
      position: {
        faker: "fakerKO.person.jobTitle()",
        comment: "직책",
      },
      jobtitle: {
        faker: "fakerKO.person.jobTitle()",
        comment: "직책",
      },
      birthdate: {
        faker: "faker.date.birthdate()",
        comment: "생년월일",
      },
      title: {
        faker: "faker.lorem.sentence()",
        comment: "제목",
      },
      description: {
        faker: "faker.lorem.paragraph()",
        comment: "설명",
      },
      content: {
        faker: "faker.lorem.paragraphs(3)",
        comment: "내용",
      },
      url: {
        faker: "faker.internet.url()",
        comment: "URL",
      },
      image: {
        faker: "faker.image.url()",
        comment: "이미지 URL",
      },
      avatar: {
        faker: "faker.image.avatar()",
        comment: "아바타 URL",
      },
      uuid: {
        faker: "faker.string.uuid()",
        comment: "UUID",
      },
      salary: {
        faker: 'faker.number.int({ "min": 30000000, "max": 150000000 })',
        comment: "연봉 (한국, 원)",
      },
      budget: {
        faker: 'faker.number.int({ "min": 10000000, "max": 500000000 })',
        comment: "예산",
      },
      price: {
        faker: 'faker.number.int({ "min": 1000, "max": 1000000 })',
        comment: "가격",
      },
      amount: {
        faker: 'faker.number.int({ "min": 1000, "max": 1000000 })',
        comment: "금액",
      },
      cost: {
        faker: 'faker.number.int({ "min": 1000, "max": 1000000 })',
        comment: "비용",
      },
      employeenumber: {
        faker: "faker.string.numeric(8)",
        comment: "사번",
      },
      code: {
        faker: "faker.string.alphanumeric(10)",
        comment: "코드",
      },
      count: {
        faker: 'faker.number.int({ "min": 0, "max": 100 })',
        comment: "개수",
      },
      quantity: {
        faker: 'faker.number.int({ "min": 1, "max": 100 })',
        comment: "수량",
      },
      mimetype: {
        faker:
          "faker.helpers.arrayElement(['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'])",
        comment: "MIME 타입",
      },
    },
    type_defaults: {
      string: {
        faker: "faker.lorem.words(3)",
        comment: "일반 문자열",
      },
      integer: {
        faker: 'faker.number.int({ "min": 1, "max": 1000 })',
        comment: "정수",
      },
      numeric: {
        faker: 'faker.number.float({ "min": 0, "max": 1000, "fractionDigits": 2 })',
        comment: "숫자",
      },
      boolean: {
        faker: "faker.datatype.boolean()",
        comment: "불리언",
      },
      date: {
        faker: "faker.date.past()",
        comment: "날짜",
      },
      uuid: {
        faker: "faker.string.uuid()",
        comment: "UUID",
      },
      json: {
        faker: "{}",
        comment: "JSON 객체",
      },
    },
  },
  en: {
    field_patterns: {
      email: {
        faker: "faker.internet.email()",
        comment: "Email address",
      },
      username: {
        faker: "faker.internet.username()",
        comment: "Username",
      },
      name: {
        faker: "faker.person.fullName()",
        comment: "Full name",
      },
      firstname: {
        faker: "faker.person.firstName()",
        comment: "First name",
      },
      lastname: {
        faker: "faker.person.lastName()",
        comment: "Last name",
      },
      phone: {
        faker: "faker.phone.number()",
        comment: "Phone number",
      },
      mobile: {
        faker: "faker.phone.number()",
        comment: "Mobile number",
      },
      address: {
        faker: "faker.location.streetAddress()",
        comment: "Street address",
      },
      city: {
        faker: "faker.location.city()",
        comment: "City",
      },
      country: {
        faker: "faker.location.country()",
        comment: "Country",
      },
      zipcode: {
        faker: "faker.location.zipCode()",
        comment: "ZIP code",
      },
      company: {
        faker: "faker.company.name()",
        comment: "Company name",
      },
      department: {
        faker: "faker.commerce.department()",
        comment: "Department",
      },
      position: {
        faker: "faker.person.jobTitle()",
        comment: "Job title",
      },
      jobtitle: {
        faker: "faker.person.jobTitle()",
        comment: "Job title",
      },
      birthdate: {
        faker: "faker.date.birthdate()",
        comment: "Birth date",
      },
      title: {
        faker: "faker.lorem.sentence()",
        comment: "Title",
      },
      description: {
        faker: "faker.lorem.paragraph()",
        comment: "Description",
      },
      content: {
        faker: "faker.lorem.paragraphs(3)",
        comment: "Content",
      },
      url: {
        faker: "faker.internet.url()",
        comment: "URL",
      },
      image: {
        faker: "faker.image.url()",
        comment: "Image URL",
      },
      avatar: {
        faker: "faker.image.avatar()",
        comment: "Avatar URL",
      },
      uuid: {
        faker: "faker.string.uuid()",
        comment: "UUID",
      },
      salary: {
        faker: 'faker.number.int({ "min": 30000, "max": 200000 })',
        comment: "Annual salary (USD)",
      },
      budget: {
        faker: 'faker.number.int({ "min": 10000, "max": 500000 })',
        comment: "Budget",
      },
      price: {
        faker: 'faker.number.int({ "min": 10, "max": 10000 })',
        comment: "Price",
      },
      amount: {
        faker: 'faker.number.int({ "min": 10, "max": 10000 })',
        comment: "Amount",
      },
      cost: {
        faker: 'faker.number.int({ "min": 10, "max": 10000 })',
        comment: "Cost",
      },
      employeenumber: {
        faker: "faker.string.numeric(8)",
        comment: "Employee number",
      },
      code: {
        faker: "faker.string.alphanumeric(10)",
        comment: "Code",
      },
      count: {
        faker: 'faker.number.int({ "min": 0, "max": 100 })',
        comment: "Count",
      },
      quantity: {
        faker: 'faker.number.int({ "min": 1, "max": 100 })',
        comment: "Quantity",
      },
      mimetype: {
        faker:
          "faker.helpers.arrayElement(['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'])",
        comment: "MIME type",
      },
    },
    type_defaults: {
      string: {
        faker: "faker.lorem.words(3)",
        comment: "String",
      },
      integer: {
        faker: 'faker.number.int({ "min": 1, "max": 1000 })',
        comment: "Integer",
      },
      numeric: {
        faker: 'faker.number.float({ "min": 0, "max": 1000, "fractionDigits": 2 })',
        comment: "Numeric",
      },
      boolean: {
        faker: "faker.datatype.boolean()",
        comment: "Boolean",
      },
      date: {
        faker: "faker.date.past()",
        comment: "Date",
      },
      uuid: {
        faker: "faker.string.uuid()",
        comment: "UUID",
      },
      json: {
        faker: "{}",
        comment: "JSON object",
      },
    },
  },
  ja: {
    field_patterns: {
      email: {
        faker: "faker.internet.email()",
        comment: "メールアドレス",
      },
      username: {
        faker: "fakerJA.person.fullName()",
        comment: "日本語名",
      },
      name: {
        faker: "fakerJA.person.fullName()",
        comment: "日本語名",
      },
      firstname: {
        faker: "fakerJA.person.firstName()",
        comment: "名",
      },
      lastname: {
        faker: "fakerJA.person.lastName()",
        comment: "姓",
      },
      phone: {
        faker: "faker.phone.number()",
        comment: "電話番号",
      },
      mobile: {
        faker: "faker.phone.number()",
        comment: "携帯電話",
      },
      address: {
        faker: "fakerJA.location.streetAddress()",
        comment: "住所",
      },
      city: {
        faker: "fakerJA.location.city()",
        comment: "都市",
      },
      company: {
        faker: "fakerJA.company.name()",
        comment: "会社名",
      },
      title: {
        faker: "faker.lorem.sentence()",
        comment: "タイトル",
      },
      salary: {
        faker: 'faker.number.int({ "min": 3000000, "max": 15000000 })',
        comment: "年収（円）",
      },
      budget: {
        faker: 'faker.number.int({ "min": 1000000, "max": 50000000 })',
        comment: "予算",
      },
    },
    type_defaults: {
      string: {
        faker: "faker.lorem.words(3)",
        comment: "文字列",
      },
      integer: {
        faker: 'faker.number.int({ "min": 1, "max": 1000 })',
        comment: "整数",
      },
      numeric: {
        faker: 'faker.number.float({ "min": 0, "max": 1000, "fractionDigits": 2 })',
        comment: "数値",
      },
      boolean: {
        faker: "faker.datatype.boolean()",
        comment: "真偽値",
      },
      date: {
        faker: "faker.date.past()",
        comment: "日付",
      },
    },
  },
} satisfies FakerMappings;
