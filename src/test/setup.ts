import "dotenv/config";

// Point the shared `db` singleton at the test database before any module imports it.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.STORAGE_DRIVER = "disk";
process.env.STORAGE_DIR = "./.test-storage";
