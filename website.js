const dotenv = require("dotenv");
const { compile } = require("html-to-text");
const {
  RecursiveUrlLoader,
} = require("@langchain/community/document_loaders/web/recursive_url");
const { CharacterTextSplitter } = require("langchain/text_splitter");
const { BigQuery } = require("@google-cloud/bigquery");
const { ChatOpenAI } = require("@langchain/openai");
const { AIMessage } = require("@langchain/core/messages");
const { HumanMessage } = require("@langchain/core/messages");
const readlineSync = require("readline-sync");
const colors = require("colors");
dotenv.config();
const bigquery = new BigQuery();

const openAIheaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
};

// Load data from website
async function loadWebData() {
  const url = "https://en.wikipedia.org/wiki/Illuminati";

  const compiledConvert = compile({
    wordwrap: 130,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { ignoreHref: true } },
    ],
  });

  const loader = new RecursiveUrlLoader(url, {
    extractor: compiledConvert,
    maxDepth: 1, // Adjust the depth as needed
  });

  const docs = await loader.load();
  //   console.log(docs);

  //   docs.forEach((doc, index) => {
  //     console.log(`Document ${index + 1} Content:`);
  //     // console.log(doc.pageContent);
  //   });
  return docs;
}

// loadWebData();

// Create embedding
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

//   Split the content into chunks
async function splitIntoChunk() {
  const data = await loadWebData();
  const text = data.map((doc) => doc.pageContent).join(" ");
  // console.log(text);
  const splitter = new CharacterTextSplitter({
    separator: "\n\n",
    chunkSize: 500,
    chunkOverlap: 100,
  });
  const output = await splitter.createDocuments([text]);

  console.log("This is output", output.length);

  if (output && output.length > 0) {
    const embeddings = await Promise.all(
      output.map(async (chunk) => {
        const embedding = await createEmbedding(chunk.pageContent);
        return { text: chunk.pageContent, embedding };
      })
    );
    // console.log(embeddings);
    return embeddings;
  } else {
    console.error("Error: Invalid output structure from text splitter");
  }
}

//   splitIntoChunk();

// Create Table
async function createTable() {
  // Creates a new table named "my_table" in "my_dataset".

  /**
   * TODO(developer): Uncomment the following lines before running the sample.
   */
  const datasetId = "webchunk_dataset";
  const tableId = "webchunk_table";
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
// createTable()

// Insert embeddings
async function insertEmbedding() {
  try {
    const chunks = await splitIntoChunk();

    const datasetId = "webchunk_dataset";
    const tableId = "webchunk_table";

    // Batch size of 1000 to avoid the 'Request Entity Too Large' error
    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      // console.log("BATCH: ",batch);
      const rows = batch.map((chunk) => ({
        text: chunk.text,
        embedding: chunk.embedding,
      }));
      await bigquery.dataset(datasetId).table(tableId).insert(rows);
      console.log(`Inserted ${rows.length} row(s)`);
    }
  } catch (error) {
    console.error("Error inserting rows:", error);
  }
}
// insertEmbedding();

// Search Embeddingd
async function searchEmbeddings(question) {
  // Question
  const questionEmbedding = await createEmbedding(question);
  // console.log(qusetionEmbedding);

  const datasetId = "webchunk_dataset";
  const tableId = "webchunk_table";
  const topK = 5;

  const embeddingString = `[${questionEmbedding.join(", ")}]`;

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
    //   console.log("Similar results: ", rows);
    return rows;
  } catch (error) {
    console.error("Error querying: " + error);
  }
}
//   searchEmbeddings("Zenith")

// Generate Answer related to question and text
async function answerGeneration(question) {
  const relevantChunks = await searchEmbeddings(question);

  // Extract the text from relevantChunks and concatenate them
  const concatenatedChunks = relevantChunks
    .map((chunk) => chunk.text)
    .join(" ");
  // console.log("Concatenated chunks:", concatenatedChunks);
  const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
    method: "POST",
    headers: openAIheaders,
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: concatenatedChunks },
        { role: "user", content: question },
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

async function getAnswer() {
  console.log(colors.bold.cyan("Welcome to the Chatbot Program!"));
  console.log(colors.bold.cyan("You can start chatting with the bot."));
  const chatHistory = [];
  while (true) {
    const userInput = readlineSync.question(colors.magenta("You: "));

    try {
        const messages = chatHistory.map(([role, content]) => {
            if (role === 'user') {
              return new HumanMessage(content);
            } else {
              return new AIMessage(content);
            }
          });

      messages.push(new HumanMessage(userInput));
      const relevantChunks = await searchEmbeddings(userInput);
      const concatenatedChunks = relevantChunks
        .map((chunk) => chunk.text)
        .join(" ");

      const model = new ChatOpenAI({
        model: "gpt-3.5-turbo",
        temperature: 0.9,
        apiKey: process.env.OPENAI_API_KEY, // In Node.js defaults to process.env.OPENAI_API_KEY
      });

      // Invoke LangChain ChatOpenAI model
      const response = await model.invoke(
        messages,
        { 
          max_tokens: 100,
          temperature: 0.3,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
        }
      );
      // get completionText
      const completionText = response.content;
    //   console.log("Answer:", response);

      if (userInput.toLowerCase() === "exit") {
        console.log(colors.yellow("Bot: ") + completionText);

        return;
      }

      console.log(colors.yellow("Bot: ") + completionText);
      //   Update history with user and response
      chatHistory.push(["user", userInput]);
      chatHistory.push(["assistant", completionText]);
    } catch (error) {
      console.error(colors.red(error));
    }
  }
}

getAnswer();