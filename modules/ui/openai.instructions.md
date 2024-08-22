# Sonamu Entity JSON Template and Rules

## Basic Template
```json
{
  "id": "EntityName",
  "table": "table_name",
  "title": "Entity Title",
  "props": [
    // Property definitions go here
  ],
  "indexes": [],
  "subsets": {
    "A": []
  },
  "enums": {
    // Enum definitions go here
  }
}
```

## Property Types and Their Attributes

1. **Integer**
   ```json
   {
     "name": "integer_prop",
     "type": "integer",
     "desc": "Example Integer Property",
     "unsigned": true,
     "nullable": true,
     "dbDefault": 0
   }
   ```

2. **Big Integer**
   ```json
   {
     "name": "big_integer_prop",
     "type": "bigInteger",
     "desc": "Example Big Integer Property",
     "unsigned": true,
     "nullable": true,
     "dbDefault": 0
   }
   ```

3. **Float**
   ```json
   {
     "name": "float_prop",
     "type": "float",
     "desc": "Example Float Property",
     "precision": 8,
     "scale": 2,
     "nullable": true,
     "dbDefault": 0.0
   }
   ```

4. **Decimal**
   ```json
   {
     "name": "decimal_prop",
     "type": "decimal",
     "desc": "Example Decimal Property",
     "precision": 8,
     "scale": 2,
     "nullable": true,
     "dbDefault": 0.0
   }
   ```

5. **Double**
   ```json
   {
     "name": "double_prop",
     "type": "double",
     "desc": "Example Double Property",
     "precision": 8,
     "scale": 2,
     "unsigned": true,
     "nullable": true,
     "dbDefault": 0.0
   }
   ```

6. **String**
   ```json
   {
     "name": "string_prop",
     "type": "string",
     "desc": "Example String Property",
     "length": 256,
     "nullable": true,
     "dbDefault": "\"default_string\""
   }
   ```

7. **Boolean**
   ```json
   {
     "name": "boolean_prop",
     "type": "boolean",
     "desc": "Example Boolean Property",
     "nullable": true,
     "dbDefault": false
   }
   ```

8. **Date**
   ```json
   {
     "name": "date_prop",
     "type": "date",
     "desc": "Example Date Property",
     "nullable": true,
     "dbDefault": "\"1970-01-01\""
   }
   ```

9. **DateTime**
   ```json
   {
     "name": "date_time_prop",
     "type": "dateTime",
     "desc": "Example DateTime Property",
     "nullable": true,
     "dbDefault": "\"1970-01-01 00:00:00\""
   }
   ```

10. **Timestamp**
    ```json
    {
      "name": "timestamp_prop",
      "type": "timestamp",
      "desc": "Example Timestamp Property",
      "dbDefault": "CURRENT_TIMESTAMP",
      "nullable": true
    }
    ```

11. **Text**
    ```json
    {
      "name": "text_prop",
      "type": "text",
      "textType": "text",
      "desc": "Example Text Property",
      "nullable": true,
      "dbDefault": "\"default_text\""
    }
    ```
    Note: `textType` can be "text", "mediumtext", or "longtext"

12. **JSON**
    ```json
    {
      "name": "json_prop",
      "type": "json",
      "id": "StringArray",
      "desc": "Example JSON Property",
      "nullable": true,
      "dbDefault": "[]"
    }
    ```

13. **Enum**
    ```json
    {
      "name": "enum_prop",
      "type": "enum",
      "id": "EntityNameExampleEnum",
      "desc": "Example Enum Property",
      "length": 16,
      "nullable": true,
      "dbDefault": "\"default_enum\""
    }
    ```

14. **Relation (BelongsToOne)**
    ```json
    {
      "name": "relation_belongs_to_one_prop",
      "type": "relation",
      "with": "RelatedEntity",
      "relationType": "BelongsToOne",
      "onUpdate": "CASCADE",
      "onDelete": "CASCADE",
      "desc": "Example BelongsToOne Relation Property",
      "nullable": true
    }
    ```

15. **Relation (HasMany)**
    ```json
    {
      "name": "relation_has_many_prop",
      "type": "relation",
      "with": "RelatedEntity",
      "relationType": "HasMany",
      "joinColumn": "related_entity_id",
      "desc": "Example HasMany Relation Property",
      "nullable": true
    }
    ```

16. **Relation (ManyToMany)**
    ```json
    {
      "name": "relation_many_to_many_prop",
      "type": "relation",
      "with": "RelatedEntity",
      "relationType": "ManyToMany",
      "joinTable": "example__related",
      "onUpdate": "CASCADE",
      "onDelete": "CASCADE",
      "desc": "Example ManyToMany Relation Property",
      "nullable": true
    }
    ```

17. **Relation (OneToOne)**
    ```json
    {
      "name": "relation_one_to_one_prop",
      "type": "relation",
      "with": "RelatedEntity",
      "relationType": "OneToOne",
      "customJoinClause": "ON example.id = related_entity.example_id",
      "hasJoinColumn": true,
      "onUpdate": "CASCADE",
      "onDelete": "CASCADE",
      "desc": "Example OneToOne Relation Property",
      "nullable": true
    }
    ```

## Additional Rules

### Entity Rules:
1. All entities must include `EntityNameOrderBy` and `EntityNameSearchField` enums.
2. Enums used within an entity should be prefixed with the entity name.
3. If not specified, return `indexes` as an empty array.
4. If not specified, return `subsets` with only an "A" key containing an empty array.
5. Use `relation` type for fields that specify relationships with other entities. Name these fields based on the related entity (e.g., "user", "author", "player") rather than using "_id" suffix.
6. If not specified, include only "id-desc" in `EntityNameOrderBy`.
7. If not specified, include only "id" in `EntityNameSearchField`.

### Property Rules:
1. Omit `nullable` if it's false (default value).
2. Omit `dbDefault` if not needed.
3. Omit `desc` if it's redundant with the entity name.
4. Use singular form for string properties and plural form for array properties.

### JSON Property Rules:
1. Use Core Types (Number, Boolean, StringArray, NumberArray, Unknown) when necessary.
2. Always include an `id` for JSON properties.

### Text Property Rules:
1. `textType` must be one of "text", "mediumtext", or "longtext".

### Relation Property Rules:
1. Use `relation` type for columns used in joins.

### Subset Rules:
1. For properties of the current entity, use the property's `name`.
2. For relation properties, use `${entity_id}.${prop_name}`.
3. List subset items in the same order as they appear in `props`.

### Index Rules:
1. Declare indexes as `{ type: "unique" | "index", columns: string[] }`.

## Response Format

When responding to a request:
1. For "Entity Definition" requests:
   - Output the Sonamu entity definition without markdown formatting.
2. For "Enum Definition" requests:
   - Output only the enum field of the Sonamu entity definition without markdown formatting.
   - Use the format: `{ [id: string]: { [key: string]: string } }`

Remember to include all necessary information and follow the structure and rules outlined above.