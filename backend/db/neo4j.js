const neo4j = require('neo4j-driver');
require('dotenv').config();

let driver = null;

const isConnected = () => {
    return driver !== null;
};

const getSession = () => {
    if(!driver) {
        return null; // Return null instead of throwing when driver not initialized
    }
    return driver.session();
}

async function connect() {
  try {
    driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password'
      ),
      {
        maxConnectionPoolSize: 5,
        connectionAcquisitionTimeout: 5000, // 5 second timeout
        connectionTimeout: 5000,
        maxTransactionRetryTime: 3000
      }
    );

    await driver.verifyConnectivity();
    console.log('✅ Neo4j connected successfully');
    await createConstraints();
  } catch (error) {
    console.error('❌ Neo4j connection error:', error.message);
    driver = null; // Reset driver on error
    throw error;
  }
}

async function createConstraints() {
  const session = driver.session();
  try {
    const constraints = [
      'CREATE CONSTRAINT service_name IF NOT EXISTS FOR (s:Service) REQUIRE s.name IS UNIQUE',
      'CREATE CONSTRAINT function_id IF NOT EXISTS FOR (f:Function) REQUIRE f.id IS UNIQUE',
      'CREATE CONSTRAINT endpoint_id IF NOT EXISTS FOR (e:Endpoint) REQUIRE e.id IS UNIQUE',
      'CREATE CONSTRAINT file_path IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE'
    ];

    for (const constraint of constraints) {
      try {
        await session.run(constraint);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.warn('Constraint creation warning:', err.message);
        }
      }
    }

    const indexes = [
      'CREATE INDEX function_name_idx IF NOT EXISTS FOR (f:Function) ON (f.name)',
      'CREATE INDEX service_type_idx IF NOT EXISTS FOR (s:Service) ON (s.type)',
      'CREATE INDEX endpoint_method_idx IF NOT EXISTS FOR (e:Endpoint) ON (e.method)'
    ];

    for (const index of indexes) {
      try {
        await session.run(index);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.warn('Index creation warning:', err.message);
        }
      }
    }

    console.log('✅ Neo4j constraints and indexes created');
  } catch (error) {
    console.error('Error creating constraints:', error);
  } finally {
    await session.close();
  }
}

function getDriver() {
  if (!driver) {
    throw new Error('Neo4j driver not initialized. Call connect() first.');
  }
  return driver;
}

async function close() {
  if (driver) {
    await driver.close();
    console.log('Neo4j connection closed');
  }
}

module.exports = {
  connect,
  createConstraints,
  getDriver,
  getSession,
  isConnected,
  close
};
