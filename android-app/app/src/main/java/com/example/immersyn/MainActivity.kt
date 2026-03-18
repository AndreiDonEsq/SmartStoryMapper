package com.example.immersyn

import android.media.MediaPlayer
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.immersyn.ui.theme.ImmersynTheme
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private var mediaPlayer: MediaPlayer? = null
    private var storyMap: Map<String, SoundMapping> = emptyMap()
    private var storySentences: List<String> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // load our data
        storyMap = loadStoryMap()
        storySentences = loadStoryText()

        setContent {
            ImmersynTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    StoryReader(
                        sentences = storySentences,
                        mapping = storyMap,
                        onSentenceClick = { fileName -> playSound(fileName) },
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }

    private fun playSound(fileName: String) {
        // stop any currently playing sound
        mediaPlayer?.release()

        try {
            // open the file from the assets/audio folder
            val descriptor = assets.openFd("audio/$fileName")
            mediaPlayer = MediaPlayer().apply {
                setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
                descriptor.close()
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e("StoryMapper", "Error playing sound: $fileName", e)
        }
    }

    private fun loadStoryMap(): Map<String, SoundMapping> {
        val mappings = mutableMapOf<String, SoundMapping>()
        try {
            val jsonString = assets.open("story_map.json").bufferedReader().use { it.readText() }
            val jsonObject = JSONObject(jsonString)

            jsonObject.keys().forEach { sentence ->
                val data = jsonObject.getJSONObject(sentence)
                mappings[sentence.trim()] = SoundMapping(
                    label = data.getString("label"),
                    file = data.getString("file")
                )
            }
        } catch (e: Exception) {
            Log.e("StoryMapper", "Error reading JSON", e)
        }
        return mappings
    }

    private fun loadStoryText(): List<String> {
        return try {
            // read the raw text and split it roughly into sentences just like our python script
            val text = assets.open("textToMap.txt").bufferedReader().use { it.readText() }
            text.replace('\n', ' ')
                .split(Regex("(?<=[.!?]) +"))
                .map { it.trim() }
                .filter { it.length > 5 }
        } catch (e: Exception) {
            Log.e("StoryMapper", "Error reading story text", e)
            emptyList()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // clean up the media player when the app closes
        mediaPlayer?.release()
        mediaPlayer = null
    }
}

@Composable
fun StoryReader(
    sentences: List<String>,
    mapping: Map<String, SoundMapping>,
    onSentenceClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    // a simple scrollable list
    LazyColumn(modifier = modifier.padding(16.dp)) {
        items(sentences) { sentence ->
            val mappedSound = mapping[sentence]
            val hasSound = mappedSound != null

            Text(
                text = sentence,
                fontSize = 18.sp,
                fontWeight = if (hasSound) FontWeight.Bold else FontWeight.Normal,
                color = if (hasSound) Color(0xFF4CAF50) else Color.Gray, // green if it has a sound
                modifier = Modifier
                    .padding(vertical = 8.dp)
                    .clickable(enabled = hasSound) {
                        mappedSound?.file?.let { onSentenceClick(it) }
                    }
            )
        }
    }
}

data class SoundMapping(
    val label: String,
    val file: String
)