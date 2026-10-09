-- Persist the JSON format independently of the optimistic write counter.
CREATE TABLE app_metadata (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    data_model INTEGER NOT NULL CHECK(data_model >= 1)
);
INSERT INTO app_metadata(id, data_model)
SELECT 1, COALESCE((SELECT json_extract(company, '$.modelVersion') FROM meta WHERE id = 1), 1);
