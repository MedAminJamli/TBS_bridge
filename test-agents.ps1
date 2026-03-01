# Test the four agents to see if they crash after multiple messages

$sessionId = "test-session-$(Get-Random)"
$baseUrl = "http://localhost:3000/api/chat"

# Test data for each agent
$tests = @(
    @{
        name = "Emotional Support"
        agentId = "code-assistant"
        messages = @(
            "Hi, I'm stressed about my exams",
            "I've been studying for hours and I'm exhausted",
            "I don't think I can focus anymore",
            "What should I do to feel better?"
        )
    },
    @{
        name = "Academic Support"
        agentId = "research-analyst"
        messages = @(
            "Can you help me understand this course concept?",
            "I'm studying for an exam in biology",
            "How should I prepare for the midterm?",
            "What does this theory mean?"
        )
    },
    @{
        name = "Career Advisor"
        agentId = "data-analyst"
        messages = @(
            "I'm interested in finance and analytics",
            "I have skills in Python and Excel",
            "I love working with numbers",
            "What jobs would match my profile?"
        )
    }
)

function Test-Agent {
    param(
        [object]$test
    )
    
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "Testing: $($test.name)" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    $sessionId = "test-$(Get-Random)-$($test.agentId)"
    
    foreach ($i in 0..($test.messages.Count - 1)) {
        $msg = $test.messages[$i]
        Write-Host "Message $($i+1): '$msg'" -ForegroundColor Yellow
        
        try {
            $body = @{
                agentId = $test.agentId
                message = $msg
                sessionId = $sessionId
            } | ConvertTo-Json
            
            $response = Invoke-WebRequest -Uri $baseUrl -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
            $data = $response.Content | ConvertFrom-Json
            
            if ($data.response) {
                $respText = ($data.response -replace "`n", " ").Substring(0, [Math]::Min(100, ($data.response -replace "`n", " ").Length))
                Write-Host "Response: $respText..." -ForegroundColor Green
            } else {
                Write-Host "ERROR: No response received" -ForegroundColor Red
            }
        } catch {
            Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
            break
        }
        
        Start-Sleep -Milliseconds 500
    }
}

# Run all tests
foreach ($test in $tests) {
    Test-Agent $test
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "All tests completed!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan
