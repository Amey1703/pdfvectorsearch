const fs = require("fs");
const pdf = require("pdf-parse");
const { CharacterTextSplitter } = require("langchain/text_splitter");
const { BigQuery } = require("@google-cloud/bigquery");
const dotenv = require("dotenv");
const { error } = require("console");
dotenv.config();
const bigquery = new BigQuery();

const openAIheaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
};

// Create Embeddings
async function createEmbedding(textToEmbed) {
  let response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: openAIheaders,
    body: JSON.stringify({
      input: textToEmbed,
      model: "text-embedding-3-small",
    }),
  });

  if (response.ok) {
    const data = await response.json();
    return data.data[0].embedding;
  }
}
//   createEmbedding()

// Parsing pdf and splitting into chunks
async function splitIntoChunk() {
  const dataBuffer = fs.readFileSync("./budget_speech.pdf");

  const pdfData = await pdf(dataBuffer);
  const text = pdfData.text;
  const splitter = new CharacterTextSplitter({
    separator: "\n\n",
    chunkSize: 250,
    chunkOverlap: 1,
  });
  const output = await splitter.createDocuments([text]);

  //   console.log(output[0]);

  if (output && output.length > 0) {
    const embeddings = await Promise.all(
      output.map(async (chunk) => {
        const embedding = await createEmbedding(chunk.pageContent);
        return { text: chunk.pageContent, embedding };
      })
    );
    //   console.log(embeddings);
    return embeddings;
  } else {
    console.error("Error: Invalid output structure from text splitter");
  }
}

// splitIntoChunk();

// Create Table
async function createTable() {
  // Creates a new table named "my_table" in "my_dataset".

  /**
   * TODO(developer): Uncomment the following lines before running the sample.
   */
  const datasetId = "chunk_dataset";
  const tableId = "chunk_table";
  const schema = [
    { name: "text", type: "STRING" },
    { name: "embedding", type: "FLOAT64", mode: "REPEATED" },
  ];

  // For all options, see https://cloud.google.com/bigquery/docs/reference/v2/tables#resource
  const options = {
    schema: schema,
    location: "US",
  };

  // Create a new table in the dataset
  const [table] = await bigquery
    .dataset(datasetId)
    .createTable(tableId, options);

  console.log(`Table ${table.id} created.`);
}
//   createTable()

// Insert embeddings
async function insertEmbedding() {
  try {
    const chunks = await splitIntoChunk();

    const datasetId = "chunk_dataset";
    const tableId = "chunk_table";

    const rows = chunks.map((chunk) => ({
      text: chunk.text,
      embedding: chunk.embedding,
    }));
    await bigquery.dataset(datasetId).table(tableId).insert(rows);
    console.log(`Inserted ${rows.length} row(s)`);
  } catch (error) {
    console.error("Error inserting rows:", error);
  }
}
// insertEmbedding();

// Searching Query
async function searchEmbeddings(question) {
  // Question
  const qusetionEmbedding = await createEmbedding(question);
  // console.log(qusetionEmbedding);

  const datasetId = "chunk_dataset";
  const tableId = "chunk_table";
  const topK = 5;

  const embeddingString = `[${qusetionEmbedding.join(", ")}]`;

  const query = `SELECT distinct 
                    base.text as text
                    FROM
                    VECTOR_SEARCH(
                      TABLE ${datasetId}.${tableId},
                      'embedding',
                        (SELECT ${embeddingString} as embedding FROM ${datasetId}.${tableId}),
                      top_k => ${topK},
                      distance_type => 'COSINE');`;

  const options = {
    query: query,
    location: "US",
  };

  try {
    const [rows] = await bigquery.query(options);
    // console.log("Similar results: ", rows);
    return rows;
  } catch (error) {
    console.error("Error querying: " + error);
  }
}

// Generate Answer related to question and text
async function answerGeneration(question) {
    const relevantChunks = await searchEmbeddings(question);
  
    // Extract the text from relevantChunks and concatenate them
    const concatenatedChunks = relevantChunks.map(chunk => chunk.text).join(" ");
    // console.log("Concatenated chunks:", concatenatedChunks);
    const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
      method: "POST",
      headers: openAIheaders,
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: concatenatedChunks },
          { role: "user", content: question  },
        ],
        max_tokens: 100,
        temperature: 0.7,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      }),
    });
  
    if (response.ok) {
      const data = await response.json();
      console.log("Answer:", data.choices[0].message.content.trim());
    } else {
      console.error("Error generating answer:", response.statusText);
    }
  }
  
  answerGeneration("Viksit Bharat");