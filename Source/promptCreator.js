/**
 * Prompt Creator Module
 * Handles template-based prompt creation with fill-in-the-blank placeholders
 */

/**
 * Hardcoded prompt templates organized by category and subcategory
 */
const promptTemplates = {
  categories: [
    {
      id: 'writing',
      title: 'Writing',
      subcategories: [
        {
          id: 'blog-posts',
          title: 'Blog Posts',
          prompts: [
            {
              id: 'blog-intro',
              title: 'Blog Post Introduction',
              template: 'Write an engaging introduction for a blog post about [topic] targeting [audience]. The tone should be [tone] and include [key-points].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'audience', type: 'select', label: 'Target Audience', options: ['General Public', 'Professionals', 'Students', 'Entrepreneurs'] },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Professional', 'Casual', 'Friendly', 'Authoritative'] },
                { id: 'key-points', type: 'input', label: 'Key Points' }
              ]
            },
            {
              id: 'blog-outline',
              title: 'Blog Post Outline',
              template: 'Create a detailed outline for a blog post about [topic] with [number] main sections. The post should cover [aspects] and target [audience].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'number', type: 'select', label: 'Number of Sections', options: ['3', '4', '5', '6'] },
                { id: 'aspects', type: 'input', label: 'Key Aspects to Cover' },
                { id: 'audience', type: 'select', label: 'Target Audience', options: ['General Public', 'Professionals', 'Students', 'Entrepreneurs'] }
              ]
            },
            {
              id: 'blog-conclusion',
              title: 'Blog Post Conclusion',
              template: 'Write a compelling conclusion for a blog post about [topic] that [purpose] and encourages readers to [action].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'purpose', type: 'select', label: 'Purpose', options: ['Summarizes key points', 'Calls for action', 'Poses a question', 'Provides next steps'] },
                { id: 'action', type: 'input', label: 'Desired Action' }
              ]
            },
            {
              id: 'blog-seo',
              title: 'SEO-Optimized Blog Post',
              template: 'Write an SEO-optimized blog post about [topic] targeting the keyword [keyword]. The post should be [length] words, include [headings], and provide [value] to readers.',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'keyword', type: 'input', label: 'Target Keyword' },
                { id: 'length', type: 'select', label: 'Word Count', options: ['500', '1000', '1500', '2000'] },
                { id: 'headings', type: 'input', label: 'Required Headings' },
                { id: 'value', type: 'input', label: 'Value to Readers' }
              ]
            },
            {
              id: 'blog-listicle',
              title: 'Listicle Blog Post',
              template: 'Create a listicle blog post titled "[title]" with [number] items about [topic]. Each item should [format] and the post should target [audience].',
              placeholders: [
                { id: 'title', type: 'input', label: 'Post Title' },
                { id: 'number', type: 'select', label: 'Number of Items', options: ['5', '7', '10', '15'] },
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'format', type: 'select', label: 'Item Format', options: ['Be detailed', 'Include examples', 'Be concise', 'Be actionable'] },
                { id: 'audience', type: 'select', label: 'Target Audience', options: ['General Public', 'Professionals', 'Students', 'Entrepreneurs'] }
              ]
            }
          ]
        },
        {
          id: 'emails',
          title: 'Emails',
          prompts: [
            {
              id: 'email-professional',
              title: 'Professional Email',
              template: 'Write a professional email to [recipient] about [subject]. The email should be [tone] and include [key-information].',
              placeholders: [
                { id: 'recipient', type: 'input', label: 'Recipient' },
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Formal', 'Professional', 'Friendly', 'Casual'] },
                { id: 'key-information', type: 'input', label: 'Key Information to Include' }
              ]
            },
            {
              id: 'email-follow-up',
              title: 'Follow-up Email',
              template: 'Write a follow-up email regarding [subject] to [recipient]. The email should be [tone] and mention [previous-context].',
              placeholders: [
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'recipient', type: 'input', label: 'Recipient' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Professional', 'Friendly', 'Polite', 'Urgent'] },
                { id: 'previous-context', type: 'input', label: 'Previous Context' }
              ]
            },
            {
              id: 'email-newsletter',
              title: 'Newsletter Email',
              template: 'Write a newsletter email for [organization] about [topic]. The newsletter should include [sections] and be [tone] for [audience].',
              placeholders: [
                { id: 'organization', type: 'input', label: 'Organization' },
                { id: 'topic', type: 'input', label: 'Main Topic' },
                { id: 'sections', type: 'input', label: 'Sections to Include' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Informative', 'Casual', 'Professional', 'Engaging'] },
                { id: 'audience', type: 'input', label: 'Target Audience' }
              ]
            },
            {
              id: 'email-meeting-request',
              title: 'Meeting Request Email',
              template: 'Write a meeting request email to [recipient] to discuss [topic] on [date-time]. The email should be [tone] and include [agenda-items].',
              placeholders: [
                { id: 'recipient', type: 'input', label: 'Recipient' },
                { id: 'topic', type: 'input', label: 'Meeting Topic' },
                { id: 'date-time', type: 'input', label: 'Proposed Date/Time' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Professional', 'Friendly', 'Formal', 'Casual'] },
                { id: 'agenda-items', type: 'input', label: 'Agenda Items' }
              ]
            },
            {
              id: 'email-thank-you',
              title: 'Thank You Email',
              template: 'Write a thank you email to [recipient] for [reason]. The email should be [tone] and express [sentiment].',
              placeholders: [
                { id: 'recipient', type: 'input', label: 'Recipient' },
                { id: 'reason', type: 'input', label: 'Reason for Thanks' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Warm', 'Professional', 'Grateful', 'Casual'] },
                { id: 'sentiment', type: 'input', label: 'Sentiment to Express' }
              ]
            }
          ]
        },
        {
          id: 'social-media',
          title: 'Social Media',
          prompts: [
            {
              id: 'social-post',
              title: 'Social Media Post',
              template: 'Create a [platform] post about [topic] that is [tone] and includes a call-to-action about [action].',
              placeholders: [
                { id: 'platform', type: 'select', label: 'Platform', options: ['Twitter/X', 'LinkedIn', 'Facebook', 'Instagram'] },
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Engaging', 'Informative', 'Funny', 'Inspirational'] },
                { id: 'action', type: 'input', label: 'Call-to-Action' }
              ]
            },
            {
              id: 'social-thread',
              title: 'Twitter/X Thread',
              template: 'Create a Twitter/X thread about [topic] with [number] tweets. The thread should [purpose] and include [key-points].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'number', type: 'select', label: 'Number of Tweets', options: ['3', '5', '7', '10'] },
                { id: 'purpose', type: 'select', label: 'Purpose', options: ['Educate', 'Entertain', 'Persuade', 'Inform'] },
                { id: 'key-points', type: 'input', label: 'Key Points to Cover' }
              ]
            },
            {
              id: 'social-story',
              title: 'Instagram Story Script',
              template: 'Create an Instagram story script about [topic] that is [tone] and includes [elements].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Casual', 'Professional', 'Fun', 'Inspirational'] },
                { id: 'elements', type: 'input', label: 'Elements to Include' }
              ]
            },
            {
              id: 'social-video-script',
              title: 'Social Media Video Script',
              template: 'Write a [platform] video script about [topic] that is [duration] seconds long. The script should be [tone] and include [call-to-action].',
              placeholders: [
                { id: 'platform', type: 'select', label: 'Platform', options: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Facebook'] },
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'duration', type: 'select', label: 'Duration', options: ['15', '30', '60', '90'] },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Energetic', 'Educational', 'Funny', 'Inspirational'] },
                { id: 'call-to-action', type: 'input', label: 'Call-to-Action' }
              ]
            }
          ]
        },
        {
          id: 'creative-writing',
          title: 'Creative Writing',
          prompts: [
            {
              id: 'short-story',
              title: 'Short Story',
              template: 'Write a short story about [theme] featuring a [character-type] protagonist. The story should be [tone] and include [elements].',
              placeholders: [
                { id: 'theme', type: 'input', label: 'Theme' },
                { id: 'character-type', type: 'select', label: 'Character Type', options: ['Hero', 'Anti-hero', 'Everyday Person', 'Mysterious Figure'] },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Dramatic', 'Humorous', 'Mysterious', 'Heartwarming'] },
                { id: 'elements', type: 'input', label: 'Key Elements' }
              ]
            },
            {
              id: 'poetry',
              title: 'Poetry',
              template: 'Write a [poetry-type] poem about [subject] with a [mood] tone. The poem should explore [theme].',
              placeholders: [
                { id: 'poetry-type', type: 'select', label: 'Poetry Type', options: ['Free Verse', 'Sonnet', 'Haiku', 'Narrative'] },
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'mood', type: 'select', label: 'Mood', options: ['Melancholic', 'Joyful', 'Reflective', 'Passionate'] },
                { id: 'theme', type: 'input', label: 'Theme' }
              ]
            },
            {
              id: 'character-development',
              title: 'Character Development',
              template: 'Develop a character named [name] who is a [role] with [personality-traits]. The character should have [background] and face [challenge].',
              placeholders: [
                { id: 'name', type: 'input', label: 'Character Name' },
                { id: 'role', type: 'input', label: 'Role/Occupation' },
                { id: 'personality-traits', type: 'input', label: 'Personality Traits' },
                { id: 'background', type: 'input', label: 'Background Story' },
                { id: 'challenge', type: 'input', label: 'Main Challenge' }
              ]
            },
            {
              id: 'plot-outline',
              title: 'Plot Outline',
              template: 'Create a plot outline for a [genre] story about [premise]. The story should have [act-structure] structure and include [key-events].',
              placeholders: [
                { id: 'genre', type: 'select', label: 'Genre', options: ['Mystery', 'Romance', 'Sci-Fi', 'Fantasy', 'Thriller'] },
                { id: 'premise', type: 'input', label: 'Story Premise' },
                { id: 'act-structure', type: 'select', label: 'Structure', options: ['Three-Act', 'Five-Act', 'Hero\'s Journey'] },
                { id: 'key-events', type: 'input', label: 'Key Events' }
              ]
            }
          ]
        },
        {
          id: 'academic-writing',
          title: 'Academic Writing',
          prompts: [
            {
              id: 'essay',
              title: 'Academic Essay',
              template: 'Write an academic essay on [topic] arguing that [thesis]. The essay should be [length] words and include [sources] sources, focusing on [aspects].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'thesis', type: 'input', label: 'Thesis Statement' },
                { id: 'length', type: 'select', label: 'Length', options: ['500', '1000', '1500', '2000'] },
                { id: 'sources', type: 'select', label: 'Number of Sources', options: ['3', '5', '7', '10'] },
                { id: 'aspects', type: 'input', label: 'Key Aspects to Cover' }
              ]
            },
            {
              id: 'research-paper',
              title: 'Research Paper',
              template: 'Write a research paper on [research-topic] using [methodology]. The paper should include [sections] and analyze [data-focus].',
              placeholders: [
                { id: 'research-topic', type: 'input', label: 'Research Topic' },
                { id: 'methodology', type: 'select', label: 'Methodology', options: ['Qualitative', 'Quantitative', 'Mixed Methods', 'Case Study'] },
                { id: 'sections', type: 'input', label: 'Required Sections' },
                { id: 'data-focus', type: 'input', label: 'Data Analysis Focus' }
              ]
            },
            {
              id: 'thesis-statement',
              title: 'Thesis Statement',
              template: 'Develop a strong thesis statement for a paper about [topic] that argues [position] based on [evidence].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'position', type: 'input', label: 'Position/Argument' },
                { id: 'evidence', type: 'input', label: 'Supporting Evidence' }
              ]
            },
            {
              id: 'literature-review',
              title: 'Literature Review',
              template: 'Write a literature review on [topic] covering [time-period]. The review should synthesize [number] sources and identify [research-gaps].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'time-period', type: 'input', label: 'Time Period' },
                { id: 'number', type: 'select', label: 'Number of Sources', options: ['10', '15', '20', '25'] },
                { id: 'research-gaps', type: 'input', label: 'Research Gaps to Identify' }
              ]
            }
          ]
        },
        {
          id: 'technical-writing',
          title: 'Technical Writing',
          prompts: [
            {
              id: 'documentation',
              title: 'Technical Documentation',
              template: 'Write technical documentation for [product-feature] that explains [functionality] for users with [skill-level] technical knowledge. Include [sections].',
              placeholders: [
                { id: 'product-feature', type: 'input', label: 'Product/Feature' },
                { id: 'functionality', type: 'input', label: 'Functionality to Document' },
                { id: 'skill-level', type: 'select', label: 'Target Skill Level', options: ['Beginner', 'Intermediate', 'Advanced'] },
                { id: 'sections', type: 'input', label: 'Required Sections' }
              ]
            },
            {
              id: 'user-guide',
              title: 'User Guide',
              template: 'Create a user guide for [product] that helps users [main-task]. The guide should include [steps] and cover [topics].',
              placeholders: [
                { id: 'product', type: 'input', label: 'Product Name' },
                { id: 'main-task', type: 'input', label: 'Main Task' },
                { id: 'steps', type: 'select', label: 'Number of Steps', options: ['5', '7', '10', '15'] },
                { id: 'topics', type: 'input', label: 'Topics to Cover' }
              ]
            },
            {
              id: 'api-documentation',
              title: 'API Documentation',
              template: 'Write API documentation for the [endpoint] endpoint that accepts [parameters] and returns [response-format]. Include [examples].',
              placeholders: [
                { id: 'endpoint', type: 'input', label: 'API Endpoint' },
                { id: 'parameters', type: 'input', label: 'Parameters' },
                { id: 'response-format', type: 'input', label: 'Response Format' },
                { id: 'examples', type: 'input', label: 'Example Use Cases' }
              ]
            }
          ]
        },
        {
          id: 'copywriting',
          title: 'Copywriting',
          prompts: [
            {
              id: 'ad-copy',
              title: 'Advertisement Copy',
              template: 'Write compelling ad copy for [product-service] targeting [audience]. The copy should emphasize [benefits] and include a call-to-action to [action].',
              placeholders: [
                { id: 'product-service', type: 'input', label: 'Product/Service' },
                { id: 'audience', type: 'input', label: 'Target Audience' },
                { id: 'benefits', type: 'input', label: 'Key Benefits' },
                { id: 'action', type: 'input', label: 'Desired Action' }
              ]
            },
            {
              id: 'landing-page',
              title: 'Landing Page Copy',
              template: 'Create landing page copy for [product-service] that converts [audience]. The page should highlight [value-proposition] and address [objections].',
              placeholders: [
                { id: 'product-service', type: 'input', label: 'Product/Service' },
                { id: 'audience', type: 'input', label: 'Target Audience' },
                { id: 'value-proposition', type: 'input', label: 'Value Proposition' },
                { id: 'objections', type: 'input', label: 'Common Objections' }
              ]
            },
            {
              id: 'product-description',
              title: 'Product Description',
              template: 'Write a product description for [product] that highlights [features] and appeals to [target-market]. The description should be [tone] and include [selling-points].',
              placeholders: [
                { id: 'product', type: 'input', label: 'Product Name' },
                { id: 'features', type: 'input', label: 'Key Features' },
                { id: 'target-market', type: 'input', label: 'Target Market' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Professional', 'Casual', 'Luxury', 'Friendly'] },
                { id: 'selling-points', type: 'input', label: 'Selling Points' }
              ]
            },
            {
              id: 'sales-email',
              title: 'Sales Email',
              template: 'Write a sales email to [recipient] about [offer] that creates urgency around [deadline]. The email should be [tone] and include [incentive].',
              placeholders: [
                { id: 'recipient', type: 'input', label: 'Recipient Type' },
                { id: 'offer', type: 'input', label: 'Offer/Product' },
                { id: 'deadline', type: 'input', label: 'Deadline/Urgency' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Professional', 'Friendly', 'Urgent', 'Persuasive'] },
                { id: 'incentive', type: 'input', label: 'Incentive/Offer' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'coding',
      title: 'Coding',
      subcategories: [
        {
          id: 'code-explanation',
          title: 'Code Explanation',
          prompts: [
            {
              id: 'explain-code',
              title: 'Explain Code',
              template: 'Explain how this code works: [code-snippet]. Focus on [aspects] and explain it for someone with [skill-level] programming knowledge.',
              placeholders: [
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'aspects', type: 'input', label: 'Aspects to Focus On' },
                { id: 'skill-level', type: 'select', label: 'Skill Level', options: ['Beginner', 'Intermediate', 'Advanced'] }
              ]
            },
            {
              id: 'explain-algorithm',
              title: 'Explain Algorithm',
              template: 'Explain the [algorithm-name] algorithm used in this code: [code-snippet]. Describe the [time-complexity] and [space-complexity] complexity.',
              placeholders: [
                { id: 'algorithm-name', type: 'input', label: 'Algorithm Name' },
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'time-complexity', type: 'input', label: 'Time Complexity' },
                { id: 'space-complexity', type: 'input', label: 'Space Complexity' }
              ]
            },
            {
              id: 'explain-architecture',
              title: 'Explain Architecture',
              template: 'Explain the architecture of this [system-type] system: [description]. Focus on [components] and how they interact.',
              placeholders: [
                { id: 'system-type', type: 'select', label: 'System Type', options: ['Web Application', 'API', 'Database', 'Microservice'] },
                { id: 'description', type: 'input', label: 'System Description' },
                { id: 'components', type: 'input', label: 'Key Components' }
              ]
            }
          ]
        },
        {
          id: 'bug-fixes',
          title: 'Bug Fixes',
          prompts: [
            {
              id: 'debug-code',
              title: 'Debug Code',
              template: 'Help me debug this [language] code: [code-snippet]. The issue is [problem-description].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++', 'Other'] },
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'problem-description', type: 'input', label: 'Problem Description' }
              ]
            },
            {
              id: 'debug-performance',
              title: 'Debug Performance Issue',
              template: 'Help me debug a performance issue in this [language] code: [code-snippet]. The problem is [symptom] and I suspect it\'s related to [area].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++'] },
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'symptom', type: 'input', label: 'Performance Symptom' },
                { id: 'area', type: 'input', label: 'Suspected Problem Area' }
              ]
            },
            {
              id: 'debug-security',
              title: 'Debug Security Issue',
              template: 'Help me identify and fix security vulnerabilities in this [language] code: [code-snippet]. Focus on [security-concerns].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++'] },
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'security-concerns', type: 'input', label: 'Security Concerns' }
              ]
            }
          ]
        },
        {
          id: 'code-generation',
          title: 'Code Generation',
          prompts: [
            {
              id: 'generate-code',
              title: 'Generate Code',
              template: 'Write [language] code that [functionality]. The code should be [code-style] and include [requirements].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++', 'HTML/CSS'] },
                { id: 'functionality', type: 'input', label: 'Functionality' },
                { id: 'code-style', type: 'select', label: 'Code Style', options: ['Clean', 'Well-commented', 'Optimized', 'Simple'] },
                { id: 'requirements', type: 'input', label: 'Additional Requirements' }
              ]
            },
            {
              id: 'generate-function',
              title: 'Generate Function',
              template: 'Write a [language] function called [function-name] that [purpose]. The function should accept [parameters] and return [return-value].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++'] },
                { id: 'function-name', type: 'input', label: 'Function Name' },
                { id: 'purpose', type: 'input', label: 'Function Purpose' },
                { id: 'parameters', type: 'input', label: 'Parameters' },
                { id: 'return-value', type: 'input', label: 'Return Value' }
              ]
            },
            {
              id: 'generate-class',
              title: 'Generate Class',
              template: 'Write a [language] class called [class-name] that [purpose]. The class should have [properties] and [methods].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++'] },
                { id: 'class-name', type: 'input', label: 'Class Name' },
                { id: 'purpose', type: 'input', label: 'Class Purpose' },
                { id: 'properties', type: 'input', label: 'Properties' },
                { id: 'methods', type: 'input', label: 'Methods' }
              ]
            },
            {
              id: 'generate-component',
              title: 'Generate Component',
              template: 'Create a [framework] component called [component-name] that [functionality]. The component should accept [props] and handle [events].',
              placeholders: [
                { id: 'framework', type: 'select', label: 'Framework', options: ['React', 'Vue', 'Angular', 'Svelte'] },
                { id: 'component-name', type: 'input', label: 'Component Name' },
                { id: 'functionality', type: 'input', label: 'Functionality' },
                { id: 'props', type: 'input', label: 'Props' },
                { id: 'events', type: 'input', label: 'Events' }
              ]
            }
          ]
        },
        {
          id: 'code-review',
          title: 'Code Review',
          prompts: [
            {
              id: 'review-request',
              title: 'Code Review Request',
              template: 'Review this [language] code: [code-snippet]. Please check for [aspects] and provide feedback on [focus-areas].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++'] },
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'aspects', type: 'select', label: 'Review Aspects', options: ['Code Quality', 'Performance', 'Security', 'Best Practices'] },
                { id: 'focus-areas', type: 'input', label: 'Focus Areas' }
              ]
            },
            {
              id: 'security-audit',
              title: 'Security Audit',
              template: 'Perform a security audit on this [language] code: [code-snippet]. Check for [vulnerability-types] and suggest [improvements].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++'] },
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'vulnerability-types', type: 'input', label: 'Vulnerability Types' },
                { id: 'improvements', type: 'input', label: 'Improvements Needed' }
              ]
            },
            {
              id: 'performance-review',
              title: 'Performance Review',
              template: 'Review the performance of this [language] code: [code-snippet]. Analyze [metrics] and suggest optimizations for [bottlenecks].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++'] },
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'metrics', type: 'input', label: 'Performance Metrics' },
                { id: 'bottlenecks', type: 'input', label: 'Potential Bottlenecks' }
              ]
            }
          ]
        },
        {
          id: 'testing',
          title: 'Testing',
          prompts: [
            {
              id: 'unit-test',
              title: 'Unit Test',
              template: 'Write unit tests for this [language] function: [code-snippet]. The tests should cover [test-cases] and use [testing-framework].',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++'] },
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'test-cases', type: 'input', label: 'Test Cases' },
                { id: 'testing-framework', type: 'select', label: 'Testing Framework', options: ['Jest', 'Mocha', 'pytest', 'JUnit'] }
              ]
            },
            {
              id: 'integration-test',
              title: 'Integration Test',
              template: 'Write integration tests for [component] that test [interactions] with [dependencies]. Use [testing-framework] and verify [expected-behavior].',
              placeholders: [
                { id: 'component', type: 'input', label: 'Component/System' },
                { id: 'interactions', type: 'input', label: 'Interactions to Test' },
                { id: 'dependencies', type: 'input', label: 'Dependencies' },
                { id: 'testing-framework', type: 'select', label: 'Testing Framework', options: ['Jest', 'Mocha', 'pytest', 'JUnit'] },
                { id: 'expected-behavior', type: 'input', label: 'Expected Behavior' }
              ]
            },
            {
              id: 'test-plan',
              title: 'Test Plan',
              template: 'Create a test plan for [feature] that includes [test-types] covering [scenarios]. The plan should prioritize [critical-paths].',
              placeholders: [
                { id: 'feature', type: 'input', label: 'Feature/Component' },
                { id: 'test-types', type: 'input', label: 'Test Types' },
                { id: 'scenarios', type: 'input', label: 'Test Scenarios' },
                { id: 'critical-paths', type: 'input', label: 'Critical Paths' }
              ]
            }
          ]
        },
        {
          id: 'documentation',
          title: 'Documentation',
          prompts: [
            {
              id: 'code-comments',
              title: 'Code Comments',
              template: 'Add comprehensive comments to this [language] code: [code-snippet]. The comments should explain [aspects] for developers with [skill-level] knowledge.',
              placeholders: [
                { id: 'language', type: 'select', label: 'Programming Language', options: ['JavaScript', 'Python', 'Java', 'C++'] },
                { id: 'code-snippet', type: 'input', label: 'Code Snippet' },
                { id: 'aspects', type: 'input', label: 'Aspects to Explain' },
                { id: 'skill-level', type: 'select', label: 'Target Skill Level', options: ['Beginner', 'Intermediate', 'Advanced'] }
              ]
            },
            {
              id: 'readme',
              title: 'README Documentation',
              template: 'Write a README for [project] that explains [purpose], installation instructions for [platforms], and usage examples for [features].',
              placeholders: [
                { id: 'project', type: 'input', label: 'Project Name' },
                { id: 'purpose', type: 'input', label: 'Project Purpose' },
                { id: 'platforms', type: 'input', label: 'Supported Platforms' },
                { id: 'features', type: 'input', label: 'Key Features' }
              ]
            },
            {
              id: 'api-docs',
              title: 'API Documentation',
              template: 'Write API documentation for the [api-name] API. Document the [endpoints] endpoints, including [parameters], [responses], and [examples].',
              placeholders: [
                { id: 'api-name', type: 'input', label: 'API Name' },
                { id: 'endpoints', type: 'input', label: 'Endpoints' },
                { id: 'parameters', type: 'input', label: 'Parameters' },
                { id: 'responses', type: 'input', label: 'Response Formats' },
                { id: 'examples', type: 'input', label: 'Example Use Cases' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'analysis',
      title: 'Analysis',
      subcategories: [
        {
          id: 'data-analysis',
          title: 'Data Analysis',
          prompts: [
            {
              id: 'analyze-data',
              title: 'Analyze Data',
              template: 'Analyze this data: [data-description]. Focus on [analysis-type] and provide insights about [focus-area].',
              placeholders: [
                { id: 'data-description', type: 'input', label: 'Data Description' },
                { id: 'analysis-type', type: 'select', label: 'Analysis Type', options: ['Trends', 'Patterns', 'Anomalies', 'Correlations'] },
                { id: 'focus-area', type: 'input', label: 'Focus Area' }
              ]
            },
            {
              id: 'predictive-analysis',
              title: 'Predictive Analysis',
              template: 'Perform a predictive analysis on [dataset] to forecast [outcome] over [timeframe]. Use [methodology] and consider [factors].',
              placeholders: [
                { id: 'dataset', type: 'input', label: 'Dataset Description' },
                { id: 'outcome', type: 'input', label: 'Outcome to Predict' },
                { id: 'timeframe', type: 'select', label: 'Timeframe', options: ['1 month', '3 months', '6 months', '1 year'] },
                { id: 'methodology', type: 'select', label: 'Methodology', options: ['Statistical Modeling', 'Machine Learning', 'Time Series', 'Regression'] },
                { id: 'factors', type: 'input', label: 'Key Factors' }
              ]
            },
            {
              id: 'statistical-analysis',
              title: 'Statistical Analysis',
              template: 'Conduct a statistical analysis of [data] to test [hypothesis]. Use [statistical-tests] and report [significance-level] with [interpretation].',
              placeholders: [
                { id: 'data', type: 'input', label: 'Data Description' },
                { id: 'hypothesis', type: 'input', label: 'Hypothesis' },
                { id: 'statistical-tests', type: 'select', label: 'Statistical Tests', options: ['t-test', 'ANOVA', 'Chi-square', 'Regression'] },
                { id: 'significance-level', type: 'select', label: 'Significance Level', options: ['0.05', '0.01', '0.10'] },
                { id: 'interpretation', type: 'input', label: 'Interpretation Focus' }
              ]
            }
          ]
        },
        {
          id: 'content-review',
          title: 'Content Review',
          prompts: [
            {
              id: 'review-content',
              title: 'Review Content',
              template: 'Review this content: [content-description]. Evaluate it for [criteria] and provide feedback on [aspects].',
              placeholders: [
                { id: 'content-description', type: 'input', label: 'Content Description' },
                { id: 'criteria', type: 'select', label: 'Evaluation Criteria', options: ['Clarity', 'Accuracy', 'Engagement', 'Completeness'] },
                { id: 'aspects', type: 'input', label: 'Aspects to Review' }
              ]
            },
            {
              id: 'seo-review',
              title: 'SEO Review',
              template: 'Review the SEO of [content-url] focusing on [seo-aspects]. Evaluate [keywords], [meta-tags], and [content-structure] for [target-audience].',
              placeholders: [
                { id: 'content-url', type: 'input', label: 'Content/URL' },
                { id: 'seo-aspects', type: 'select', label: 'SEO Aspects', options: ['On-page SEO', 'Keyword Optimization', 'Meta Tags', 'Content Quality'] },
                { id: 'keywords', type: 'input', label: 'Target Keywords' },
                { id: 'meta-tags', type: 'input', label: 'Meta Tags' },
                { id: 'content-structure', type: 'input', label: 'Content Structure' },
                { id: 'target-audience', type: 'input', label: 'Target Audience' }
              ]
            },
            {
              id: 'accessibility-review',
              title: 'Accessibility Review',
              template: 'Review the accessibility of [content-website] for [standards]. Check [elements] and provide recommendations for [improvements] to ensure [accessibility-goals].',
              placeholders: [
                { id: 'content-website', type: 'input', label: 'Content/Website' },
                { id: 'standards', type: 'select', label: 'Standards', options: ['WCAG 2.1 AA', 'WCAG 2.1 AAA', 'Section 508'] },
                { id: 'elements', type: 'input', label: 'Elements to Check' },
                { id: 'improvements', type: 'input', label: 'Improvements Needed' },
                { id: 'accessibility-goals', type: 'input', label: 'Accessibility Goals' }
              ]
            }
          ]
        },
        {
          id: 'market-research',
          title: 'Market Research',
          prompts: [
            {
              id: 'market-analysis',
              title: 'Market Analysis',
              template: 'Conduct a market analysis for [product-service] in the [market-segment]. Analyze [market-size], [competition], [trends], and [opportunities].',
              placeholders: [
                { id: 'product-service', type: 'input', label: 'Product/Service' },
                { id: 'market-segment', type: 'input', label: 'Market Segment' },
                { id: 'market-size', type: 'input', label: 'Market Size' },
                { id: 'competition', type: 'input', label: 'Competitive Landscape' },
                { id: 'trends', type: 'input', label: 'Market Trends' },
                { id: 'opportunities', type: 'input', label: 'Market Opportunities' }
              ]
            },
            {
              id: 'competitor-research',
              title: 'Competitor Research',
              template: 'Research competitors in the [industry] market, focusing on [competitors]. Analyze their [strategies], [strengths], [weaknesses], and [market-position].',
              placeholders: [
                { id: 'industry', type: 'input', label: 'Industry' },
                { id: 'competitors', type: 'input', label: 'Competitors' },
                { id: 'strategies', type: 'input', label: 'Competitive Strategies' },
                { id: 'strengths', type: 'input', label: 'Their Strengths' },
                { id: 'weaknesses', type: 'input', label: 'Their Weaknesses' },
                { id: 'market-position', type: 'input', label: 'Market Position' }
              ]
            },
            {
              id: 'user-research',
              title: 'User Research',
              template: 'Design user research for [product-service] targeting [user-segment]. The research should explore [user-needs], [pain-points], and [behaviors] using [methodology].',
              placeholders: [
                { id: 'product-service', type: 'input', label: 'Product/Service' },
                { id: 'user-segment', type: 'input', label: 'User Segment' },
                { id: 'user-needs', type: 'input', label: 'User Needs' },
                { id: 'pain-points', type: 'input', label: 'Pain Points' },
                { id: 'behaviors', type: 'input', label: 'User Behaviors' },
                { id: 'methodology', type: 'select', label: 'Research Methodology', options: ['Interviews', 'Surveys', 'Observations', 'Focus Groups'] }
              ]
            }
          ]
        },
        {
          id: 'financial-analysis',
          title: 'Financial Analysis',
          prompts: [
            {
              id: 'budget-analysis',
              title: 'Budget Analysis',
              template: 'Analyze the budget for [project-department] covering [timeframe]. Review [income-expenses], identify [variances], and recommend [adjustments] to achieve [financial-goals].',
              placeholders: [
                { id: 'project-department', type: 'input', label: 'Project/Department' },
                { id: 'timeframe', type: 'select', label: 'Timeframe', options: ['Monthly', 'Quarterly', 'Annual'] },
                { id: 'income-expenses', type: 'input', label: 'Income/Expenses' },
                { id: 'variances', type: 'input', label: 'Budget Variances' },
                { id: 'adjustments', type: 'input', label: 'Recommended Adjustments' },
                { id: 'financial-goals', type: 'input', label: 'Financial Goals' }
              ]
            },
            {
              id: 'financial-report',
              title: 'Financial Report',
              template: 'Create a financial report for [entity] covering [period]. The report should include [financial-statements], analyze [key-metrics], and provide [insights] on [performance].',
              placeholders: [
                { id: 'entity', type: 'input', label: 'Company/Entity' },
                { id: 'period', type: 'select', label: 'Reporting Period', options: ['Q1', 'Q2', 'Q3', 'Q4', 'Annual'] },
                { id: 'financial-statements', type: 'input', label: 'Financial Statements' },
                { id: 'key-metrics', type: 'input', label: 'Key Metrics' },
                { id: 'insights', type: 'input', label: 'Key Insights' },
                { id: 'performance', type: 'input', label: 'Performance Areas' }
              ]
            },
            {
              id: 'roi-calculation',
              title: 'ROI Calculation',
              template: 'Calculate the ROI for [investment] over [timeframe]. Include [costs], [returns], [benefits], and provide [recommendations] based on [threshold].',
              placeholders: [
                { id: 'investment', type: 'input', label: 'Investment/Project' },
                { id: 'timeframe', type: 'select', label: 'Timeframe', options: ['3 months', '6 months', '1 year', '2 years'] },
                { id: 'costs', type: 'input', label: 'Total Costs' },
                { id: 'returns', type: 'input', label: 'Expected Returns' },
                { id: 'benefits', type: 'input', label: 'Additional Benefits' },
                { id: 'recommendations', type: 'input', label: 'Recommendations' },
                { id: 'threshold', type: 'input', label: 'ROI Threshold' }
              ]
            }
          ]
        },
        {
          id: 'performance-analysis',
          title: 'Performance Analysis',
          prompts: [
            {
              id: 'kpi-analysis',
              title: 'KPI Analysis',
              template: 'Analyze KPIs for [department-metric] over [period]. Evaluate [metrics], compare against [targets-benchmarks], and identify [trends] with [action-items].',
              placeholders: [
                { id: 'department-metric', type: 'input', label: 'Department/Metric' },
                { id: 'period', type: 'select', label: 'Analysis Period', options: ['Weekly', 'Monthly', 'Quarterly'] },
                { id: 'metrics', type: 'input', label: 'Key Metrics' },
                { id: 'targets-benchmarks', type: 'input', label: 'Targets/Benchmarks' },
                { id: 'trends', type: 'input', label: 'Performance Trends' },
                { id: 'action-items', type: 'input', label: 'Action Items' }
              ]
            },
            {
              id: 'dashboard',
              title: 'Performance Dashboard',
              template: 'Design a performance dashboard for [team-department] that tracks [metrics] with [visualizations]. The dashboard should highlight [priorities] and alert on [thresholds].',
              placeholders: [
                { id: 'team-department', type: 'input', label: 'Team/Department' },
                { id: 'metrics', type: 'input', label: 'Key Metrics' },
                { id: 'visualizations', type: 'select', label: 'Visualization Types', options: ['Charts', 'Graphs', 'Tables', 'Gauges'] },
                { id: 'priorities', type: 'input', label: 'Priority Metrics' },
                { id: 'thresholds', type: 'input', label: 'Alert Thresholds' }
              ]
            },
            {
              id: 'metrics-review',
              title: 'Metrics Review',
              template: 'Review performance metrics for [area] comparing [current-period] vs [previous-period]. Analyze [changes], identify [drivers], and recommend [improvements].',
              placeholders: [
                { id: 'area', type: 'input', label: 'Performance Area' },
                { id: 'current-period', type: 'input', label: 'Current Period' },
                { id: 'previous-period', type: 'input', label: 'Previous Period' },
                { id: 'changes', type: 'input', label: 'Key Changes' },
                { id: 'drivers', type: 'input', label: 'Performance Drivers' },
                { id: 'improvements', type: 'input', label: 'Improvement Opportunities' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'business',
      title: 'Business',
      subcategories: [
        {
          id: 'marketing',
          title: 'Marketing',
          prompts: [
            {
              id: 'marketing-strategy',
              title: 'Marketing Strategy',
              template: 'Create a marketing strategy for [product-service] targeting [target-audience]. The strategy should focus on [channels] and emphasize [key-messages].',
              placeholders: [
                { id: 'product-service', type: 'input', label: 'Product/Service' },
                { id: 'target-audience', type: 'input', label: 'Target Audience' },
                { id: 'channels', type: 'select', label: 'Marketing Channels', options: ['Social Media', 'Email', 'Content Marketing', 'Paid Advertising'] },
                { id: 'key-messages', type: 'input', label: 'Key Messages' }
              ]
            },
            {
              id: 'marketing-campaign',
              title: 'Marketing Campaign',
              template: 'Design a [duration] marketing campaign for [product-service] that targets [audience] through [channels]. The campaign should achieve [goals] and include [elements].',
              placeholders: [
                { id: 'duration', type: 'select', label: 'Campaign Duration', options: ['1 week', '1 month', '3 months', '6 months'] },
                { id: 'product-service', type: 'input', label: 'Product/Service' },
                { id: 'audience', type: 'input', label: 'Target Audience' },
                { id: 'channels', type: 'input', label: 'Marketing Channels' },
                { id: 'goals', type: 'input', label: 'Campaign Goals' },
                { id: 'elements', type: 'input', label: 'Campaign Elements' }
              ]
            },
            {
              id: 'content-calendar',
              title: 'Content Calendar',
              template: 'Create a content calendar for [platform] covering [timeframe] that includes [content-types] about [topics]. The calendar should target [audience] and maintain [posting-frequency].',
              placeholders: [
                { id: 'platform', type: 'select', label: 'Platform', options: ['Social Media', 'Blog', 'Email Newsletter', 'YouTube'] },
                { id: 'timeframe', type: 'select', label: 'Timeframe', options: ['1 week', '1 month', '3 months'] },
                { id: 'content-types', type: 'input', label: 'Content Types' },
                { id: 'topics', type: 'input', label: 'Topics' },
                { id: 'audience', type: 'input', label: 'Target Audience' },
                { id: 'posting-frequency', type: 'select', label: 'Posting Frequency', options: ['Daily', '3x per week', 'Weekly', 'Bi-weekly'] }
              ]
            },
            {
              id: 'ab-test',
              title: 'A/B Test Plan',
              template: 'Create an A/B test plan for [element] comparing [variant-a] vs [variant-b]. The test should measure [metrics] over [duration] with [sample-size] participants.',
              placeholders: [
                { id: 'element', type: 'input', label: 'Element to Test' },
                { id: 'variant-a', type: 'input', label: 'Variant A' },
                { id: 'variant-b', type: 'input', label: 'Variant B' },
                { id: 'metrics', type: 'input', label: 'Success Metrics' },
                { id: 'duration', type: 'select', label: 'Test Duration', options: ['1 week', '2 weeks', '1 month'] },
                { id: 'sample-size', type: 'input', label: 'Sample Size' }
              ]
            }
          ]
        },
        {
          id: 'strategy',
          title: 'Strategy',
          prompts: [
            {
              id: 'business-strategy',
              title: 'Business Strategy',
              template: 'Develop a business strategy for [business-type] in the [industry] industry. The strategy should address [challenges] and leverage [strengths].',
              placeholders: [
                { id: 'business-type', type: 'input', label: 'Business Type' },
                { id: 'industry', type: 'input', label: 'Industry' },
                { id: 'challenges', type: 'input', label: 'Key Challenges' },
                { id: 'strengths', type: 'input', label: 'Business Strengths' }
              ]
            },
            {
              id: 'swot-analysis',
              title: 'SWOT Analysis',
              template: 'Conduct a SWOT analysis for [business-product]. Identify [strengths] strengths, [weaknesses] weaknesses, [opportunities] opportunities, and [threats] threats.',
              placeholders: [
                { id: 'business-product', type: 'input', label: 'Business/Product' },
                { id: 'strengths', type: 'input', label: 'Key Strengths' },
                { id: 'weaknesses', type: 'input', label: 'Key Weaknesses' },
                { id: 'opportunities', type: 'input', label: 'Market Opportunities' },
                { id: 'threats', type: 'input', label: 'Potential Threats' }
              ]
            },
            {
              id: 'competitive-analysis',
              title: 'Competitive Analysis',
              template: 'Perform a competitive analysis of [competitors] in the [market]. Compare [factors] and identify [differentiators] that give [company] a competitive advantage.',
              placeholders: [
                { id: 'competitors', type: 'input', label: 'Competitors' },
                { id: 'market', type: 'input', label: 'Market/Industry' },
                { id: 'factors', type: 'input', label: 'Comparison Factors' },
                { id: 'differentiators', type: 'input', label: 'Key Differentiators' },
                { id: 'company', type: 'input', label: 'Your Company' }
              ]
            },
            {
              id: 'growth-strategy',
              title: 'Growth Strategy',
              template: 'Develop a growth strategy for [business] to achieve [goal] over [timeframe]. The strategy should focus on [growth-areas] and leverage [resources].',
              placeholders: [
                { id: 'business', type: 'input', label: 'Business/Product' },
                { id: 'goal', type: 'input', label: 'Growth Goal' },
                { id: 'timeframe', type: 'select', label: 'Timeframe', options: ['3 months', '6 months', '1 year', '2 years'] },
                { id: 'growth-areas', type: 'input', label: 'Growth Areas' },
                { id: 'resources', type: 'input', label: 'Available Resources' }
              ]
            }
          ]
        },
        {
          id: 'sales',
          title: 'Sales',
          prompts: [
            {
              id: 'pitch-deck',
              title: 'Pitch Deck',
              template: 'Create a pitch deck for [product-service] targeting [investors-customers]. The deck should highlight [value-proposition], address [market-opportunity], and present [financial-projections].',
              placeholders: [
                { id: 'product-service', type: 'input', label: 'Product/Service' },
                { id: 'investors-customers', type: 'select', label: 'Target Audience', options: ['Investors', 'Customers', 'Partners', 'Stakeholders'] },
                { id: 'value-proposition', type: 'input', label: 'Value Proposition' },
                { id: 'market-opportunity', type: 'input', label: 'Market Opportunity' },
                { id: 'financial-projections', type: 'input', label: 'Financial Projections' }
              ]
            },
            {
              id: 'sales-proposal',
              title: 'Sales Proposal',
              template: 'Write a sales proposal for [product-service] to [client]. The proposal should address [client-needs], present [solution], and include [pricing-terms].',
              placeholders: [
                { id: 'product-service', type: 'input', label: 'Product/Service' },
                { id: 'client', type: 'input', label: 'Client Name' },
                { id: 'client-needs', type: 'input', label: 'Client Needs' },
                { id: 'solution', type: 'input', label: 'Proposed Solution' },
                { id: 'pricing-terms', type: 'input', label: 'Pricing & Terms' }
              ]
            },
            {
              id: 'negotiation-strategy',
              title: 'Negotiation Strategy',
              template: 'Develop a negotiation strategy for [situation] with [counterparty]. The strategy should aim for [desired-outcome], leverage [strengths], and address [concerns].',
              placeholders: [
                { id: 'situation', type: 'input', label: 'Negotiation Situation' },
                { id: 'counterparty', type: 'input', label: 'Counterparty' },
                { id: 'desired-outcome', type: 'input', label: 'Desired Outcome' },
                { id: 'strengths', type: 'input', label: 'Your Strengths' },
                { id: 'concerns', type: 'input', label: 'Their Concerns' }
              ]
            }
          ]
        },
        {
          id: 'customer-service',
          title: 'Customer Service',
          prompts: [
            {
              id: 'support-response',
              title: 'Support Response',
              template: 'Write a customer support response to [customer-issue]. The response should be [tone], acknowledge [concern], and provide [solution] with [next-steps].',
              placeholders: [
                { id: 'customer-issue', type: 'input', label: 'Customer Issue' },
                { id: 'tone', type: 'select', label: 'Tone', options: ['Empathetic', 'Professional', 'Helpful', 'Apologetic'] },
                { id: 'concern', type: 'input', label: 'Customer Concern' },
                { id: 'solution', type: 'input', label: 'Solution' },
                { id: 'next-steps', type: 'input', label: 'Next Steps' }
              ]
            },
            {
              id: 'faq',
              title: 'FAQ Creation',
              template: 'Create an FAQ section for [product-service] that answers common questions about [topics]. Include [number] questions covering [categories].',
              placeholders: [
                { id: 'product-service', type: 'input', label: 'Product/Service' },
                { id: 'topics', type: 'input', label: 'Topics' },
                { id: 'number', type: 'select', label: 'Number of Questions', options: ['5', '10', '15', '20'] },
                { id: 'categories', type: 'input', label: 'FAQ Categories' }
              ]
            },
            {
              id: 'complaint-handling',
              title: 'Complaint Handling',
              template: 'Write a response to a customer complaint about [issue]. The response should [apologize-acknowledge], explain [cause], and offer [resolution] to prevent [recurrence].',
              placeholders: [
                { id: 'issue', type: 'input', label: 'Complaint Issue' },
                { id: 'apologize-acknowledge', type: 'select', label: 'Approach', options: ['Apologize sincerely', 'Acknowledge the issue', 'Take responsibility', 'Show empathy'] },
                { id: 'cause', type: 'input', label: 'Root Cause' },
                { id: 'resolution', type: 'input', label: 'Resolution' },
                { id: 'recurrence', type: 'input', label: 'Future Prevention' }
              ]
            }
          ]
        },
        {
          id: 'operations',
          title: 'Operations',
          prompts: [
            {
              id: 'process-documentation',
              title: 'Process Documentation',
              template: 'Document the [process-name] process that involves [steps]. The documentation should include [requirements], [responsibilities], and [timeline] for [stakeholders].',
              placeholders: [
                { id: 'process-name', type: 'input', label: 'Process Name' },
                { id: 'steps', type: 'input', label: 'Process Steps' },
                { id: 'requirements', type: 'input', label: 'Requirements' },
                { id: 'responsibilities', type: 'input', label: 'Responsibilities' },
                { id: 'timeline', type: 'input', label: 'Timeline' },
                { id: 'stakeholders', type: 'input', label: 'Stakeholders' }
              ]
            },
            {
              id: 'workflow',
              title: 'Workflow Design',
              template: 'Design a workflow for [task] that includes [stages] with [decision-points]. The workflow should optimize [efficiency] and handle [exceptions].',
              placeholders: [
                { id: 'task', type: 'input', label: 'Task/Process' },
                { id: 'stages', type: 'input', label: 'Workflow Stages' },
                { id: 'decision-points', type: 'input', label: 'Decision Points' },
                { id: 'efficiency', type: 'input', label: 'Efficiency Goals' },
                { id: 'exceptions', type: 'input', label: 'Exception Handling' }
              ]
            },
            {
              id: 'sop',
              title: 'Standard Operating Procedure',
              template: 'Create a Standard Operating Procedure (SOP) for [procedure] that outlines [steps] with [safety-measures] and [quality-checks] for [team].',
              placeholders: [
                { id: 'procedure', type: 'input', label: 'Procedure Name' },
                { id: 'steps', type: 'input', label: 'Procedure Steps' },
                { id: 'safety-measures', type: 'input', label: 'Safety Measures' },
                { id: 'quality-checks', type: 'input', label: 'Quality Checks' },
                { id: 'team', type: 'input', label: 'Target Team' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'education',
      title: 'Education',
      subcategories: [
        {
          id: 'study-guides',
          title: 'Study Guides',
          prompts: [
            {
              id: 'create-study-guide',
              title: 'Create Study Guide',
              template: 'Create a comprehensive study guide for [subject] covering [topics]. The guide should be suitable for [level] students and include [elements].',
              placeholders: [
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'topics', type: 'input', label: 'Topics to Cover' },
                { id: 'level', type: 'select', label: 'Student Level', options: ['Elementary', 'High School', 'College', 'Graduate'] },
                { id: 'elements', type: 'input', label: 'Elements to Include' }
              ]
            },
            {
              id: 'flashcards',
              title: 'Flashcards',
              template: 'Create flashcards for [subject] covering [concepts]. Each card should have [front-content] on the front and [back-content] on the back, suitable for [level] students.',
              placeholders: [
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'concepts', type: 'input', label: 'Concepts to Cover' },
                { id: 'front-content', type: 'input', label: 'Front Content Type' },
                { id: 'back-content', type: 'input', label: 'Back Content Type' },
                { id: 'level', type: 'select', label: 'Student Level', options: ['Elementary', 'High School', 'College', 'Graduate'] }
              ]
            },
            {
              id: 'summary',
              title: 'Summary',
              template: 'Create a summary of [content] focusing on [key-points]. The summary should be [length] and suitable for [audience] to understand [main-ideas].',
              placeholders: [
                { id: 'content', type: 'input', label: 'Content to Summarize' },
                { id: 'key-points', type: 'input', label: 'Key Points' },
                { id: 'length', type: 'select', label: 'Summary Length', options: ['Brief', 'Medium', 'Detailed'] },
                { id: 'audience', type: 'input', label: 'Target Audience' },
                { id: 'main-ideas', type: 'input', label: 'Main Ideas' }
              ]
            },
            {
              id: 'concept-map',
              title: 'Concept Map',
              template: 'Create a concept map for [topic] showing relationships between [concepts]. The map should illustrate [connections] and help [level] students understand [learning-objectives].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'concepts', type: 'input', label: 'Key Concepts' },
                { id: 'connections', type: 'input', label: 'Concept Connections' },
                { id: 'level', type: 'select', label: 'Student Level', options: ['Elementary', 'High School', 'College', 'Graduate'] },
                { id: 'learning-objectives', type: 'input', label: 'Learning Objectives' }
              ]
            }
          ]
        },
        {
          id: 'lesson-planning',
          title: 'Lesson Planning',
          prompts: [
            {
              id: 'lesson-plan',
              title: 'Lesson Plan',
              template: 'Create a lesson plan for [subject] on [topic] for [grade-level] students. The lesson should last [duration] and include [activities] to achieve [learning-objectives].',
              placeholders: [
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'topic', type: 'input', label: 'Topic' },
                { id: 'grade-level', type: 'select', label: 'Grade Level', options: ['Elementary', 'Middle School', 'High School', 'College'] },
                { id: 'duration', type: 'select', label: 'Duration', options: ['30 minutes', '45 minutes', '60 minutes', '90 minutes'] },
                { id: 'activities', type: 'input', label: 'Learning Activities' },
                { id: 'learning-objectives', type: 'input', label: 'Learning Objectives' }
              ]
            },
            {
              id: 'curriculum-design',
              title: 'Curriculum Design',
              template: 'Design a curriculum for [subject] covering [timeframe] that includes [units] units. The curriculum should align with [standards] and prepare students for [outcomes].',
              placeholders: [
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'timeframe', type: 'select', label: 'Timeframe', options: ['Semester', 'Academic Year', 'Quarter'] },
                { id: 'units', type: 'select', label: 'Number of Units', options: ['4', '6', '8', '10'] },
                { id: 'standards', type: 'input', label: 'Educational Standards' },
                { id: 'outcomes', type: 'input', label: 'Learning Outcomes' }
              ]
            },
            {
              id: 'activity-design',
              title: 'Activity Design',
              template: 'Design a [activity-type] activity for [subject] that engages [grade-level] students in [learning-goal]. The activity should take [duration] and require [materials].',
              placeholders: [
                { id: 'activity-type', type: 'select', label: 'Activity Type', options: ['Hands-on', 'Group Work', 'Discussion', 'Project-based'] },
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'grade-level', type: 'select', label: 'Grade Level', options: ['Elementary', 'Middle School', 'High School', 'College'] },
                { id: 'learning-goal', type: 'input', label: 'Learning Goal' },
                { id: 'duration', type: 'select', label: 'Duration', options: ['15 minutes', '30 minutes', '45 minutes', '60 minutes'] },
                { id: 'materials', type: 'input', label: 'Required Materials' }
              ]
            }
          ]
        },
        {
          id: 'assessment',
          title: 'Assessment',
          prompts: [
            {
              id: 'quiz-creation',
              title: 'Quiz Creation',
              template: 'Create a [question-type] quiz for [subject] covering [topics] with [number] questions. The quiz should assess [knowledge-skills] at [difficulty-level] level.',
              placeholders: [
                { id: 'question-type', type: 'select', label: 'Question Type', options: ['Multiple Choice', 'True/False', 'Short Answer', 'Mixed'] },
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'topics', type: 'input', label: 'Topics' },
                { id: 'number', type: 'select', label: 'Number of Questions', options: ['5', '10', '15', '20'] },
                { id: 'knowledge-skills', type: 'input', label: 'Knowledge/Skills' },
                { id: 'difficulty-level', type: 'select', label: 'Difficulty Level', options: ['Beginner', 'Intermediate', 'Advanced'] }
              ]
            },
            {
              id: 'rubric-design',
              title: 'Rubric Design',
              template: 'Design a rubric for [assignment-type] that evaluates [criteria] on a [scale] scale. The rubric should assess [performance-levels] and provide [feedback-focus].',
              placeholders: [
                { id: 'assignment-type', type: 'input', label: 'Assignment Type' },
                { id: 'criteria', type: 'input', label: 'Evaluation Criteria' },
                { id: 'scale', type: 'select', label: 'Rating Scale', options: ['1-4', '1-5', '1-10', 'Letter Grades'] },
                { id: 'performance-levels', type: 'input', label: 'Performance Levels' },
                { id: 'feedback-focus', type: 'input', label: 'Feedback Focus' }
              ]
            },
            {
              id: 'exam-questions',
              title: 'Exam Questions',
              template: 'Create exam questions for [subject] covering [topics]. Include [question-types] questions that test [learning-objectives] at [difficulty] level for [grade-level] students.',
              placeholders: [
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'topics', type: 'input', label: 'Topics' },
                { id: 'question-types', type: 'select', label: 'Question Types', options: ['Multiple Choice', 'Essay', 'Problem-solving', 'Mixed'] },
                { id: 'learning-objectives', type: 'input', label: 'Learning Objectives' },
                { id: 'difficulty', type: 'select', label: 'Difficulty', options: ['Basic', 'Intermediate', 'Advanced'] },
                { id: 'grade-level', type: 'select', label: 'Grade Level', options: ['High School', 'College', 'Graduate'] }
              ]
            }
          ]
        },
        {
          id: 'tutoring',
          title: 'Tutoring',
          prompts: [
            {
              id: 'explanation',
              title: 'Concept Explanation',
              template: 'Explain [concept] to a [grade-level] student who is struggling with [difficulty]. Use [teaching-method] and provide [examples] to help them understand [key-principles].',
              placeholders: [
                { id: 'concept', type: 'input', label: 'Concept' },
                { id: 'grade-level', type: 'select', label: 'Grade Level', options: ['Elementary', 'Middle School', 'High School', 'College'] },
                { id: 'difficulty', type: 'input', label: 'Specific Difficulty' },
                { id: 'teaching-method', type: 'select', label: 'Teaching Method', options: ['Step-by-step', 'Visual', 'Analogies', 'Real-world Examples'] },
                { id: 'examples', type: 'input', label: 'Examples to Include' },
                { id: 'key-principles', type: 'input', label: 'Key Principles' }
              ]
            },
            {
              id: 'practice-problems',
              title: 'Practice Problems',
              template: 'Create [number] practice problems for [subject] focusing on [skill]. The problems should progress from [difficulty-start] to [difficulty-end] and include [solution-guidance].',
              placeholders: [
                { id: 'number', type: 'select', label: 'Number of Problems', options: ['5', '10', '15', '20'] },
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'skill', type: 'input', label: 'Skill to Practice' },
                { id: 'difficulty-start', type: 'select', label: 'Starting Difficulty', options: ['Easy', 'Medium', 'Hard'] },
                { id: 'difficulty-end', type: 'select', label: 'Ending Difficulty', options: ['Easy', 'Medium', 'Hard'] },
                { id: 'solution-guidance', type: 'input', label: 'Solution Guidance' }
              ]
            },
            {
              id: 'study-tips',
              title: 'Study Tips',
              template: 'Provide study tips for [subject] to help [grade-level] students improve their [performance-area]. Include [strategies] and [techniques] that address [common-challenges].',
              placeholders: [
                { id: 'subject', type: 'input', label: 'Subject' },
                { id: 'grade-level', type: 'select', label: 'Grade Level', options: ['Elementary', 'Middle School', 'High School', 'College'] },
                { id: 'performance-area', type: 'input', label: 'Performance Area' },
                { id: 'strategies', type: 'input', label: 'Study Strategies' },
                { id: 'techniques', type: 'input', label: 'Learning Techniques' },
                { id: 'common-challenges', type: 'input', label: 'Common Challenges' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'creative',
      title: 'Creative',
      subcategories: [
        {
          id: 'art-design',
          title: 'Art & Design',
          prompts: [
            {
              id: 'design-brief',
              title: 'Design Brief',
              template: 'Create a design brief for [project-type] targeting [audience]. The design should convey [message], use [style], and include [requirements] within [constraints].',
              placeholders: [
                { id: 'project-type', type: 'select', label: 'Project Type', options: ['Logo', 'Website', 'Brand Identity', 'Product Design'] },
                { id: 'audience', type: 'input', label: 'Target Audience' },
                { id: 'message', type: 'input', label: 'Key Message' },
                { id: 'style', type: 'input', label: 'Design Style' },
                { id: 'requirements', type: 'input', label: 'Requirements' },
                { id: 'constraints', type: 'input', label: 'Constraints' }
              ]
            },
            {
              id: 'creative-direction',
              title: 'Creative Direction',
              template: 'Develop creative direction for [campaign-project] that aligns with [brand-identity]. The direction should emphasize [themes], use [visual-style], and appeal to [target-audience].',
              placeholders: [
                { id: 'campaign-project', type: 'input', label: 'Campaign/Project' },
                { id: 'brand-identity', type: 'input', label: 'Brand Identity' },
                { id: 'themes', type: 'input', label: 'Key Themes' },
                { id: 'visual-style', type: 'input', label: 'Visual Style' },
                { id: 'target-audience', type: 'input', label: 'Target Audience' }
              ]
            },
            {
              id: 'style-guide',
              title: 'Style Guide',
              template: 'Create a style guide for [brand-project] that defines [color-palette], [typography], [imagery], and [tone] to ensure [consistency] across [applications].',
              placeholders: [
                { id: 'brand-project', type: 'input', label: 'Brand/Project' },
                { id: 'color-palette', type: 'input', label: 'Color Palette' },
                { id: 'typography', type: 'input', label: 'Typography' },
                { id: 'imagery', type: 'input', label: 'Imagery Style' },
                { id: 'tone', type: 'input', label: 'Brand Tone' },
                { id: 'consistency', type: 'input', label: 'Consistency Goals' },
                { id: 'applications', type: 'input', label: 'Applications' }
              ]
            }
          ]
        },
        {
          id: 'music',
          title: 'Music',
          prompts: [
            {
              id: 'songwriting',
              title: 'Songwriting',
              template: 'Write a [genre] song about [theme] with a [mood] tone. The song should have [structure] structure, include [elements], and convey [emotion].',
              placeholders: [
                { id: 'genre', type: 'select', label: 'Genre', options: ['Pop', 'Rock', 'Country', 'Hip-Hop', 'Jazz'] },
                { id: 'theme', type: 'input', label: 'Theme' },
                { id: 'mood', type: 'select', label: 'Mood', options: ['Upbeat', 'Melancholic', 'Energetic', 'Reflective'] },
                { id: 'structure', type: 'select', label: 'Song Structure', options: ['Verse-Chorus', 'AABA', 'Verse-Bridge-Chorus'] },
                { id: 'elements', type: 'input', label: 'Musical Elements' },
                { id: 'emotion', type: 'input', label: 'Emotion to Convey' }
              ]
            },
            {
              id: 'composition',
              title: 'Music Composition',
              template: 'Compose a [style] piece of music in [key] key with [tempo] tempo. The composition should feature [instruments], follow [form], and create [atmosphere].',
              placeholders: [
                { id: 'style', type: 'select', label: 'Style', options: ['Classical', 'Jazz', 'Electronic', 'Ambient'] },
                { id: 'key', type: 'input', label: 'Musical Key' },
                { id: 'tempo', type: 'input', label: 'Tempo' },
                { id: 'instruments', type: 'input', label: 'Instruments' },
                { id: 'form', type: 'input', label: 'Musical Form' },
                { id: 'atmosphere', type: 'input', label: 'Desired Atmosphere' }
              ]
            }
          ]
        },
        {
          id: 'storytelling',
          title: 'Storytelling',
          prompts: [
            {
              id: 'narrative-structure',
              title: 'Narrative Structure',
              template: 'Develop a narrative structure for a [genre] story about [premise]. The structure should follow [framework], include [plot-points], and build [tension] toward [climax].',
              placeholders: [
                { id: 'genre', type: 'select', label: 'Genre', options: ['Drama', 'Comedy', 'Thriller', 'Romance', 'Sci-Fi'] },
                { id: 'premise', type: 'input', label: 'Story Premise' },
                { id: 'framework', type: 'select', label: 'Narrative Framework', options: ['Three-Act', 'Hero\'s Journey', 'Five-Act', 'Freytag\'s Pyramid'] },
                { id: 'plot-points', type: 'input', label: 'Key Plot Points' },
                { id: 'tension', type: 'input', label: 'Tension Building' },
                { id: 'climax', type: 'input', label: 'Climax' }
              ]
            },
            {
              id: 'character-arc',
              title: 'Character Arc',
              template: 'Design a character arc for [character-name] who starts as [starting-state] and transforms into [ending-state] through [journey]. The arc should show [growth] and address [internal-conflict].',
              placeholders: [
                { id: 'character-name', type: 'input', label: 'Character Name' },
                { id: 'starting-state', type: 'input', label: 'Starting State' },
                { id: 'ending-state', type: 'input', label: 'Ending State' },
                { id: 'journey', type: 'input', label: 'Character Journey' },
                { id: 'growth', type: 'input', label: 'Character Growth' },
                { id: 'internal-conflict', type: 'input', label: 'Internal Conflict' }
              ]
            },
            {
              id: 'plot-development',
              title: 'Plot Development',
              template: 'Develop the plot for a [genre] story where [protagonist] must [goal] while facing [obstacles]. The plot should include [twists], build [suspense], and resolve with [resolution].',
              placeholders: [
                { id: 'genre', type: 'select', label: 'Genre', options: ['Mystery', 'Adventure', 'Drama', 'Fantasy'] },
                { id: 'protagonist', type: 'input', label: 'Protagonist' },
                { id: 'goal', type: 'input', label: 'Main Goal' },
                { id: 'obstacles', type: 'input', label: 'Obstacles' },
                { id: 'twists', type: 'input', label: 'Plot Twists' },
                { id: 'suspense', type: 'input', label: 'Suspense Elements' },
                { id: 'resolution', type: 'input', label: 'Resolution' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'productivity',
      title: 'Productivity',
      subcategories: [
        {
          id: 'task-management',
          title: 'Task Management',
          prompts: [
            {
              id: 'task-breakdown',
              title: 'Task Breakdown',
              template: 'Break down the project "[project-name]" into manageable tasks. Organize tasks by [priority], estimate [timeframes], assign [dependencies], and create [milestones] for [timeline].',
              placeholders: [
                { id: 'project-name', type: 'input', label: 'Project Name' },
                { id: 'priority', type: 'select', label: 'Priority System', options: ['High/Medium/Low', 'Urgent/Important', '1-5 Scale'] },
                { id: 'timeframes', type: 'input', label: 'Time Estimates' },
                { id: 'dependencies', type: 'input', label: 'Task Dependencies' },
                { id: 'milestones', type: 'input', label: 'Key Milestones' },
                { id: 'timeline', type: 'input', label: 'Overall Timeline' }
              ]
            },
            {
              id: 'priority-matrix',
              title: 'Priority Matrix',
              template: 'Create a priority matrix for [tasks-projects] categorizing items by [urgency] and [importance]. Identify [quick-wins], [major-projects], [delegate-items], and [eliminate-items].',
              placeholders: [
                { id: 'tasks-projects', type: 'input', label: 'Tasks/Projects' },
                { id: 'urgency', type: 'input', label: 'Urgency Criteria' },
                { id: 'importance', type: 'input', label: 'Importance Criteria' },
                { id: 'quick-wins', type: 'input', label: 'Quick Wins' },
                { id: 'major-projects', type: 'input', label: 'Major Projects' },
                { id: 'delegate-items', type: 'input', label: 'Items to Delegate' },
                { id: 'eliminate-items', type: 'input', label: 'Items to Eliminate' }
              ]
            },
            {
              id: 'project-plan',
              title: 'Project Plan',
              template: 'Create a project plan for [project] with [phases] phases over [duration]. The plan should include [deliverables], [resources], [risks], and [success-criteria].',
              placeholders: [
                { id: 'project', type: 'input', label: 'Project Name' },
                { id: 'phases', type: 'select', label: 'Number of Phases', options: ['3', '4', '5', '6'] },
                { id: 'duration', type: 'select', label: 'Project Duration', options: ['1 month', '3 months', '6 months', '1 year'] },
                { id: 'deliverables', type: 'input', label: 'Key Deliverables' },
                { id: 'resources', type: 'input', label: 'Required Resources' },
                { id: 'risks', type: 'input', label: 'Potential Risks' },
                { id: 'success-criteria', type: 'input', label: 'Success Criteria' }
              ]
            }
          ]
        },
        {
          id: 'time-management',
          title: 'Time Management',
          prompts: [
            {
              id: 'schedule-optimization',
              title: 'Schedule Optimization',
              template: 'Optimize the schedule for [person-team] to maximize [productivity-goal] while balancing [activities]. The schedule should allocate [time-blocks] and include [buffer-time] for [unexpected-tasks].',
              placeholders: [
                { id: 'person-team', type: 'input', label: 'Person/Team' },
                { id: 'productivity-goal', type: 'input', label: 'Productivity Goal' },
                { id: 'activities', type: 'input', label: 'Activities' },
                { id: 'time-blocks', type: 'input', label: 'Time Blocking' },
                { id: 'buffer-time', type: 'input', label: 'Buffer Time' },
                { id: 'unexpected-tasks', type: 'input', label: 'Unexpected Tasks' }
              ]
            },
            {
              id: 'time-audit',
              title: 'Time Audit',
              template: 'Conduct a time audit for [period] tracking [activities] and their [duration]. Analyze [time-wasters], identify [inefficiencies], and recommend [improvements] to achieve [time-goals].',
              placeholders: [
                { id: 'period', type: 'select', label: 'Time Period', options: ['1 day', '1 week', '2 weeks', '1 month'] },
                { id: 'activities', type: 'input', label: 'Activities' },
                { id: 'duration', type: 'input', label: 'Time Spent' },
                { id: 'time-wasters', type: 'input', label: 'Time Wasters' },
                { id: 'inefficiencies', type: 'input', label: 'Inefficiencies' },
                { id: 'improvements', type: 'input', label: 'Improvements' },
                { id: 'time-goals', type: 'input', label: 'Time Management Goals' }
              ]
            },
            {
              id: 'productivity-system',
              title: 'Productivity System',
              template: 'Design a productivity system for [context] that incorporates [methods] to manage [tasks], track [progress], and maintain [work-life-balance]. The system should support [goals].',
              placeholders: [
                { id: 'context', type: 'input', label: 'Work Context' },
                { id: 'methods', type: 'select', label: 'Productivity Methods', options: ['GTD', 'Pomodoro', 'Time Blocking', 'Eisenhower Matrix'] },
                { id: 'tasks', type: 'input', label: 'Task Types' },
                { id: 'progress', type: 'input', label: 'Progress Tracking' },
                { id: 'work-life-balance', type: 'input', label: 'Work-Life Balance' },
                { id: 'goals', type: 'input', label: 'Productivity Goals' }
              ]
            }
          ]
        },
        {
          id: 'goal-setting',
          title: 'Goal Setting',
          prompts: [
            {
              id: 'smart-goals',
              title: 'SMART Goals',
              template: 'Create SMART goals for [area] that are [specific], measurable by [metrics], achievable through [actions], relevant to [purpose], and time-bound by [deadline].',
              placeholders: [
                { id: 'area', type: 'input', label: 'Goal Area' },
                { id: 'specific', type: 'input', label: 'Specific Goal' },
                { id: 'metrics', type: 'input', label: 'Measurement Metrics' },
                { id: 'actions', type: 'input', label: 'Achievable Actions' },
                { id: 'purpose', type: 'input', label: 'Relevance/Purpose' },
                { id: 'deadline', type: 'input', label: 'Deadline' }
              ]
            },
            {
              id: 'action-plan',
              title: 'Action Plan',
              template: 'Develop an action plan to achieve [goal] by [deadline]. The plan should include [steps], require [resources], address [challenges], and track [milestones] for [accountability].',
              placeholders: [
                { id: 'goal', type: 'input', label: 'Goal' },
                { id: 'deadline', type: 'input', label: 'Deadline' },
                { id: 'steps', type: 'input', label: 'Action Steps' },
                { id: 'resources', type: 'input', label: 'Required Resources' },
                { id: 'challenges', type: 'input', label: 'Potential Challenges' },
                { id: 'milestones', type: 'input', label: 'Key Milestones' },
                { id: 'accountability', type: 'input', label: 'Accountability Measures' }
              ]
            },
            {
              id: 'milestone-tracking',
              title: 'Milestone Tracking',
              template: 'Set up milestone tracking for [goal] with [number] milestones over [timeframe]. Each milestone should measure [progress-indicators] and celebrate [achievements] toward [ultimate-goal].',
              placeholders: [
                { id: 'goal', type: 'input', label: 'Goal' },
                { id: 'number', type: 'select', label: 'Number of Milestones', options: ['3', '5', '7', '10'] },
                { id: 'timeframe', type: 'select', label: 'Timeframe', options: ['1 month', '3 months', '6 months', '1 year'] },
                { id: 'progress-indicators', type: 'input', label: 'Progress Indicators' },
                { id: 'achievements', type: 'input', label: 'Achievements' },
                { id: 'ultimate-goal', type: 'input', label: 'Ultimate Goal' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'research',
      title: 'Research',
      subcategories: [
        {
          id: 'literature-review',
          title: 'Literature Review',
          prompts: [
            {
              id: 'research-question',
              title: 'Research Question',
              template: 'Formulate a research question about [topic] that is [specificity], [feasible] to investigate, and addresses [research-gap]. The question should guide [methodology] and contribute to [field].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Research Topic' },
                { id: 'specificity', type: 'select', label: 'Specificity', options: ['Highly specific', 'Moderately specific', 'Broad but focused'] },
                { id: 'feasible', type: 'input', label: 'Feasibility' },
                { id: 'research-gap', type: 'input', label: 'Research Gap' },
                { id: 'methodology', type: 'input', label: 'Research Methodology' },
                { id: 'field', type: 'input', label: 'Research Field' }
              ]
            },
            {
              id: 'methodology',
              title: 'Research Methodology',
              template: 'Design a research methodology for studying [research-topic] using [approach]. The methodology should include [data-collection], [analysis-methods], and address [ethical-considerations] for [participants].',
              placeholders: [
                { id: 'research-topic', type: 'input', label: 'Research Topic' },
                { id: 'approach', type: 'select', label: 'Research Approach', options: ['Qualitative', 'Quantitative', 'Mixed Methods', 'Case Study'] },
                { id: 'data-collection', type: 'input', label: 'Data Collection Methods' },
                { id: 'analysis-methods', type: 'input', label: 'Analysis Methods' },
                { id: 'ethical-considerations', type: 'input', label: 'Ethical Considerations' },
                { id: 'participants', type: 'input', label: 'Participants' }
              ]
            },
            {
              id: 'findings-summary',
              title: 'Findings Summary',
              template: 'Summarize research findings on [topic] from [number] studies. Highlight [key-discoveries], identify [patterns], discuss [implications], and note [limitations] for [audience].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Research Topic' },
                { id: 'number', type: 'select', label: 'Number of Studies', options: ['5', '10', '15', '20'] },
                { id: 'key-discoveries', type: 'input', label: 'Key Discoveries' },
                { id: 'patterns', type: 'input', label: 'Patterns' },
                { id: 'implications', type: 'input', label: 'Implications' },
                { id: 'limitations', type: 'input', label: 'Limitations' },
                { id: 'audience', type: 'input', label: 'Target Audience' }
              ]
            }
          ]
        },
        {
          id: 'survey-design',
          title: 'Survey Design',
          prompts: [
            {
              id: 'questionnaire',
              title: 'Questionnaire',
              template: 'Design a questionnaire to gather data on [research-topic] from [target-population]. Include [question-types] questions covering [topics] and ensure [validity-reliability] for [research-purpose].',
              placeholders: [
                { id: 'research-topic', type: 'input', label: 'Research Topic' },
                { id: 'target-population', type: 'input', label: 'Target Population' },
                { id: 'question-types', type: 'select', label: 'Question Types', options: ['Multiple Choice', 'Likert Scale', 'Open-ended', 'Mixed'] },
                { id: 'topics', type: 'input', label: 'Topics to Cover' },
                { id: 'validity-reliability', type: 'input', label: 'Validity/Reliability' },
                { id: 'research-purpose', type: 'input', label: 'Research Purpose' }
              ]
            },
            {
              id: 'interview-guide',
              title: 'Interview Guide',
              template: 'Create an interview guide for [interview-type] interviews about [topic] with [participants]. Include [question-categories], use [interview-style], and explore [themes] to gather [information].',
              placeholders: [
                { id: 'interview-type', type: 'select', label: 'Interview Type', options: ['Structured', 'Semi-structured', 'Unstructured', 'Focus Group'] },
                { id: 'topic', type: 'input', label: 'Interview Topic' },
                { id: 'participants', type: 'input', label: 'Participants' },
                { id: 'question-categories', type: 'input', label: 'Question Categories' },
                { id: 'interview-style', type: 'input', label: 'Interview Style' },
                { id: 'themes', type: 'input', label: 'Key Themes' },
                { id: 'information', type: 'input', label: 'Information to Gather' }
              ]
            },
            {
              id: 'data-collection',
              title: 'Data Collection Plan',
              template: 'Develop a data collection plan for [research-study] that uses [methods] to gather [data-types] from [sources] over [duration]. The plan should ensure [data-quality] and address [challenges].',
              placeholders: [
                { id: 'research-study', type: 'input', label: 'Research Study' },
                { id: 'methods', type: 'select', label: 'Data Collection Methods', options: ['Surveys', 'Interviews', 'Observations', 'Mixed Methods'] },
                { id: 'data-types', type: 'input', label: 'Data Types' },
                { id: 'sources', type: 'input', label: 'Data Sources' },
                { id: 'duration', type: 'select', label: 'Collection Duration', options: ['1 week', '1 month', '3 months', '6 months'] },
                { id: 'data-quality', type: 'input', label: 'Data Quality Measures' },
                { id: 'challenges', type: 'input', label: 'Potential Challenges' }
              ]
            }
          ]
        },
        {
          id: 'report-writing',
          title: 'Report Writing',
          prompts: [
            {
              id: 'research-report',
              title: 'Research Report',
              template: 'Write a research report on [topic] presenting [findings] from [methodology]. The report should include [sections], analyze [data], discuss [implications], and provide [recommendations] for [stakeholders].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Research Topic' },
                { id: 'findings', type: 'input', label: 'Key Findings' },
                { id: 'methodology', type: 'input', label: 'Research Methodology' },
                { id: 'sections', type: 'input', label: 'Report Sections' },
                { id: 'data', type: 'input', label: 'Data Analysis' },
                { id: 'implications', type: 'input', label: 'Implications' },
                { id: 'recommendations', type: 'input', label: 'Recommendations' },
                { id: 'stakeholders', type: 'input', label: 'Target Stakeholders' }
              ]
            },
            {
              id: 'executive-summary',
              title: 'Executive Summary',
              template: 'Write an executive summary of [report-study] highlighting [key-findings], [recommendations], and [action-items] for [decision-makers]. The summary should be [length] and focus on [priorities].',
              placeholders: [
                { id: 'report-study', type: 'input', label: 'Report/Study' },
                { id: 'key-findings', type: 'input', label: 'Key Findings' },
                { id: 'recommendations', type: 'input', label: 'Recommendations' },
                { id: 'action-items', type: 'input', label: 'Action Items' },
                { id: 'decision-makers', type: 'input', label: 'Decision Makers' },
                { id: 'length', type: 'select', label: 'Length', options: ['1 page', '2 pages', '3 pages'] },
                { id: 'priorities', type: 'input', label: 'Priority Areas' }
              ]
            },
            {
              id: 'findings-presentation',
              title: 'Findings Presentation',
              template: 'Create a presentation of research findings on [topic] for [audience]. The presentation should highlight [discoveries], use [visualizations], explain [methodology], and recommend [next-steps].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Research Topic' },
                { id: 'audience', type: 'input', label: 'Target Audience' },
                { id: 'discoveries', type: 'input', label: 'Key Discoveries' },
                { id: 'visualizations', type: 'select', label: 'Visualization Types', options: ['Charts', 'Graphs', 'Infographics', 'Diagrams'] },
                { id: 'methodology', type: 'input', label: 'Research Methodology' },
                { id: 'next-steps', type: 'input', label: 'Next Steps' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'communication',
      title: 'Communication',
      subcategories: [
        {
          id: 'presentations',
          title: 'Presentations',
          prompts: [
            {
              id: 'slide-deck',
              title: 'Slide Deck',
              template: 'Create a slide deck for [presentation-topic] targeting [audience]. The deck should have [number] slides covering [sections], use [visual-style], and achieve [presentation-goal].',
              placeholders: [
                { id: 'presentation-topic', type: 'input', label: 'Presentation Topic' },
                { id: 'audience', type: 'input', label: 'Target Audience' },
                { id: 'number', type: 'select', label: 'Number of Slides', options: ['10', '15', '20', '25'] },
                { id: 'sections', type: 'input', label: 'Key Sections' },
                { id: 'visual-style', type: 'input', label: 'Visual Style' },
                { id: 'presentation-goal', type: 'input', label: 'Presentation Goal' }
              ]
            },
            {
              id: 'pitch',
              title: 'Pitch Presentation',
              template: 'Develop a pitch presentation for [idea-product] to [audience]. The pitch should explain [value-proposition], address [objections], present [traction], and request [ask] within [time-limit].',
              placeholders: [
                { id: 'idea-product', type: 'input', label: 'Idea/Product' },
                { id: 'audience', type: 'select', label: 'Audience', options: ['Investors', 'Clients', 'Stakeholders', 'Partners'] },
                { id: 'value-proposition', type: 'input', label: 'Value Proposition' },
                { id: 'objections', type: 'input', label: 'Potential Objections' },
                { id: 'traction', type: 'input', label: 'Traction/Proof' },
                { id: 'ask', type: 'input', label: 'The Ask' },
                { id: 'time-limit', type: 'select', label: 'Time Limit', options: ['5 minutes', '10 minutes', '15 minutes', '30 minutes'] }
              ]
            },
            {
              id: 'webinar-script',
              title: 'Webinar Script',
              template: 'Write a webinar script for [topic] targeting [audience] over [duration]. The script should include [sections], incorporate [interactive-elements], and end with [call-to-action].',
              placeholders: [
                { id: 'topic', type: 'input', label: 'Webinar Topic' },
                { id: 'audience', type: 'input', label: 'Target Audience' },
                { id: 'duration', type: 'select', label: 'Duration', options: ['30 minutes', '45 minutes', '60 minutes', '90 minutes'] },
                { id: 'sections', type: 'input', label: 'Webinar Sections' },
                { id: 'interactive-elements', type: 'input', label: 'Interactive Elements' },
                { id: 'call-to-action', type: 'input', label: 'Call-to-Action' }
              ]
            }
          ]
        },
        {
          id: 'meetings',
          title: 'Meetings',
          prompts: [
            {
              id: 'agenda',
              title: 'Meeting Agenda',
              template: 'Create a meeting agenda for [meeting-type] with [participants] covering [topics] over [duration]. The agenda should include [discussion-points], allocate [time-slots], and assign [action-items].',
              placeholders: [
                { id: 'meeting-type', type: 'select', label: 'Meeting Type', options: ['Team Meeting', 'Project Review', 'Strategy Session', 'Status Update'] },
                { id: 'participants', type: 'input', label: 'Participants' },
                { id: 'topics', type: 'input', label: 'Topics to Cover' },
                { id: 'duration', type: 'select', label: 'Duration', options: ['30 minutes', '60 minutes', '90 minutes'] },
                { id: 'discussion-points', type: 'input', label: 'Discussion Points' },
                { id: 'time-slots', type: 'input', label: 'Time Allocation' },
                { id: 'action-items', type: 'input', label: 'Action Items' }
              ]
            },
            {
              id: 'meeting-notes',
              title: 'Meeting Notes',
              template: 'Document meeting notes from [meeting-topic] with [participants] on [date]. Include [decisions], [action-items] assigned to [owners], [next-steps] with [deadlines], and [follow-up-items].',
              placeholders: [
                { id: 'meeting-topic', type: 'input', label: 'Meeting Topic' },
                { id: 'participants', type: 'input', label: 'Participants' },
                { id: 'date', type: 'input', label: 'Meeting Date' },
                { id: 'decisions', type: 'input', label: 'Key Decisions' },
                { id: 'action-items', type: 'input', label: 'Action Items' },
                { id: 'owners', type: 'input', label: 'Action Owners' },
                { id: 'next-steps', type: 'input', label: 'Next Steps' },
                { id: 'deadlines', type: 'input', label: 'Deadlines' },
                { id: 'follow-up-items', type: 'input', label: 'Follow-up Items' }
              ]
            },
            {
              id: 'action-items',
              title: 'Action Items List',
              template: 'Create an action items list from [meeting-context] with [number] items. Each item should have [owner], [description], [deadline], and [status] tracking for [accountability].',
              placeholders: [
                { id: 'meeting-context', type: 'input', label: 'Meeting/Context' },
                { id: 'number', type: 'select', label: 'Number of Items', options: ['3', '5', '7', '10'] },
                { id: 'owner', type: 'input', label: 'Item Owners' },
                { id: 'description', type: 'input', label: 'Item Descriptions' },
                { id: 'deadline', type: 'input', label: 'Deadlines' },
                { id: 'status', type: 'select', label: 'Status Tracking', options: ['Not Started', 'In Progress', 'Completed', 'Blocked'] },
                { id: 'accountability', type: 'input', label: 'Accountability Measures' }
              ]
            }
          ]
        },
        {
          id: 'negotiation',
          title: 'Negotiation',
          prompts: [
            {
              id: 'negotiation-strategy',
              title: 'Negotiation Strategy',
              template: 'Develop a negotiation strategy for [situation] with [counterparty] to achieve [desired-outcome]. The strategy should leverage [strengths], address [concerns], and include [fallback-options].',
              placeholders: [
                { id: 'situation', type: 'input', label: 'Negotiation Situation' },
                { id: 'counterparty', type: 'input', label: 'Counterparty' },
                { id: 'desired-outcome', type: 'input', label: 'Desired Outcome' },
                { id: 'strengths', type: 'input', label: 'Your Strengths' },
                { id: 'concerns', type: 'input', label: 'Their Concerns' },
                { id: 'fallback-options', type: 'input', label: 'Fallback Options' }
              ]
            },
            {
              id: 'conflict-resolution',
              title: 'Conflict Resolution',
              template: 'Design a conflict resolution approach for [conflict-situation] between [parties]. The approach should acknowledge [perspectives], identify [root-causes], and propose [solutions] that address [interests].',
              placeholders: [
                { id: 'conflict-situation', type: 'input', label: 'Conflict Situation' },
                { id: 'parties', type: 'input', label: 'Involved Parties' },
                { id: 'perspectives', type: 'input', label: 'Different Perspectives' },
                { id: 'root-causes', type: 'input', label: 'Root Causes' },
                { id: 'solutions', type: 'input', label: 'Proposed Solutions' },
                { id: 'interests', type: 'input', label: 'Underlying Interests' }
              ]
            }
          ]
        }
      ]
    }
  ]
};

/**
 * Current state of the Prompt Creator
 */
let creatorState = {
  selectedCategory: null,
  selectedSubcategory: null,
  selectedTemplate: null,
  userSelections: {} // Map of placeholder ID to user's selected value
};

/**
 * Reference to the current state object (set during initialization)
 */
let promptCreatorStateRef = null;

/**
 * Dependencies for save to library functionality (set during initialization)
 */
let promptCreatorDependencies = null;

/**
 * Sets dependencies for save to library functionality
 * Called from sidepanel.js after initialization
 */
window.setPromptCreatorDependencies = function(dependencies) {
  promptCreatorDependencies = dependencies;
};

/**
 * Initializes the Prompt Creator section
 * @param {Object} stateRef - Reference to current state object
 */
export function initPromptCreator(stateRef) {
  console.log("[PromptProfile™] Initializing Prompt Creator");
  
  // Store state reference for use in save to library handler
  promptCreatorStateRef = stateRef;
  
  // Reset state
  creatorState = {
    selectedCategory: null,
    selectedSubcategory: null,
    selectedTemplate: null,
    userSelections: {}
  };
  
  // Render initial view (categories)
  renderCategories();
  
  // Register event handlers
  registerEventHandlers();
}

/**
 * Renders the category list
 */
export function renderCategories() {
  const container = document.getElementById('prompt-creator-content');
  if (!container) {
    console.error("[PromptProfile™] Prompt Creator content container not found");
    return;
  }
  
  container.innerHTML = `
    <div class="prompt-creator__categories">
      <h3 class="prompt-creator__section-title">Select a Category</h3>
      <div class="prompt-creator__category-list">
        ${promptTemplates.categories.map(category => `
          <button 
            class="prompt-creator__category-btn" 
            data-category-id="${category.id}"
            type="button"
          >
            ${category.title}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  
  // Attach click handlers
  container.querySelectorAll('.prompt-creator__category-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const categoryId = e.currentTarget.dataset.categoryId;
      selectCategory(categoryId);
    });
  });
}

/**
 * Handles category selection
 * @param {string} categoryId - ID of the selected category
 */
function selectCategory(categoryId) {
  creatorState.selectedCategory = categoryId;
  creatorState.selectedSubcategory = null;
  creatorState.selectedTemplate = null;
  creatorState.userSelections = {};
  
  const category = promptTemplates.categories.find(c => c.id === categoryId);
  if (!category) return;
  
  const container = document.getElementById('prompt-creator-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="prompt-creator__navigation">
      <button class="prompt-creator__back-btn" type="button" data-action="back-to-categories">
        ← Back to Categories
      </button>
    </div>
    <div class="prompt-creator__subcategories">
      <h3 class="prompt-creator__section-title">${category.title} - Select a Subcategory</h3>
      <div class="prompt-creator__subcategory-list">
        ${category.subcategories.map(subcat => `
          <button 
            class="prompt-creator__subcategory-btn" 
            data-subcategory-id="${subcat.id}"
            type="button"
          >
            ${subcat.title}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  
  // Attach click handlers
  container.querySelector('[data-action="back-to-categories"]')?.addEventListener('click', () => {
    renderCategories();
  });
  
  container.querySelectorAll('.prompt-creator__subcategory-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const subcategoryId = e.currentTarget.dataset.subcategoryId;
      selectSubcategory(categoryId, subcategoryId);
    });
  });
}

/**
 * Handles subcategory selection
 * @param {string} categoryId - ID of the selected category
 * @param {string} subcategoryId - ID of the selected subcategory
 */
function selectSubcategory(categoryId, subcategoryId) {
  creatorState.selectedSubcategory = subcategoryId;
  creatorState.selectedTemplate = null;
  creatorState.userSelections = {};
  
  const category = promptTemplates.categories.find(c => c.id === categoryId);
  if (!category) return;
  
  const subcategory = category.subcategories.find(s => s.id === subcategoryId);
  if (!subcategory) return;
  
  const container = document.getElementById('prompt-creator-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="prompt-creator__navigation">
      <button class="prompt-creator__back-btn" type="button" data-action="back-to-subcategories">
        ← Back to Subcategories
      </button>
    </div>
    <div class="prompt-creator__templates">
      <h3 class="prompt-creator__section-title">${subcategory.title} - Select a Template</h3>
      <div class="prompt-creator__template-list">
        ${subcategory.prompts.map(prompt => `
          <button 
            class="prompt-creator__template-btn" 
            data-template-id="${prompt.id}"
            type="button"
          >
            <div class="prompt-creator__template-title">${prompt.title}</div>
            <div class="prompt-creator__template-preview">${prompt.template.substring(0, 80)}...</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  
  // Attach click handlers
  container.querySelector('[data-action="back-to-subcategories"]')?.addEventListener('click', () => {
    selectCategory(categoryId);
  });
  
  container.querySelectorAll('.prompt-creator__template-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const templateId = e.currentTarget.dataset.templateId;
      selectTemplate(categoryId, subcategoryId, templateId);
    });
  });
}

/**
 * Handles template selection and renders placeholder inputs
 * @param {string} categoryId - ID of the selected category
 * @param {string} subcategoryId - ID of the selected subcategory
 * @param {string} templateId - ID of the selected template
 */
function selectTemplate(categoryId, subcategoryId, templateId) {
  creatorState.selectedTemplate = templateId;
  creatorState.userSelections = {};
  
  const category = promptTemplates.categories.find(c => c.id === categoryId);
  if (!category) return;
  
  const subcategory = category.subcategories.find(s => s.id === subcategoryId);
  if (!subcategory) return;
  
  const template = subcategory.prompts.find(p => p.id === templateId);
  if (!template) return;
  
  const container = document.getElementById('prompt-creator-content');
  if (!container) return;
  
  // Render placeholder inputs
  const placeholderInputs = template.placeholders.map(placeholder => {
    if (placeholder.type === 'select') {
      return `
        <div class="prompt-creator__placeholder-field">
          <label class="prompt-creator__placeholder-label" for="placeholder-${placeholder.id}">
            ${placeholder.label}
          </label>
          <select 
            class="prompt-creator__placeholder-select" 
            id="placeholder-${placeholder.id}"
            data-placeholder-id="${placeholder.id}"
          >
            <option value="">Select ${placeholder.label}</option>
            ${placeholder.options.map(opt => `
              <option value="${opt}">${opt}</option>
            `).join('')}
          </select>
        </div>
      `;
    } else {
      return `
        <div class="prompt-creator__placeholder-field">
          <label class="prompt-creator__placeholder-label" for="placeholder-${placeholder.id}">
            ${placeholder.label}
          </label>
          <input 
            type="text" 
            class="prompt-creator__placeholder-input" 
            id="placeholder-${placeholder.id}"
            data-placeholder-id="${placeholder.id}"
            placeholder="Enter ${placeholder.label.toLowerCase()}"
          />
        </div>
      `;
    }
  }).join('');
  
  container.innerHTML = `
    <div class="prompt-creator__navigation">
      <button class="prompt-creator__back-btn" type="button" data-action="back-to-templates">
        ← Back to Templates
      </button>
    </div>
    <div class="prompt-creator__template-editor">
      <h3 class="prompt-creator__section-title">${template.title}</h3>
      <div class="prompt-creator__placeholders">
        ${placeholderInputs}
      </div>
      <div class="prompt-creator__preview">
        <div class="prompt-creator__preview-label">Preview:</div>
        <textarea 
          class="prompt-creator__preview-textarea" 
          id="prompt-creator-final-prompt"
          readonly
        >${template.template}</textarea>
      </div>
      <div class="prompt-creator__actions">
        <button class="btn btn--primary" id="prompt-creator-insert-btn" type="button">
          Insert Prompt
        </button>
        <button class="btn btn--ghost" id="prompt-creator-save-to-library-btn" type="button">
          Save to Library
        </button>
      </div>
    </div>
  `;
  
  // Attach back button handler
  container.querySelector('[data-action="back-to-templates"]')?.addEventListener('click', () => {
    selectSubcategory(categoryId, subcategoryId);
  });
  
  // Attach input handlers for real-time preview updates
  container.querySelectorAll('.prompt-creator__placeholder-input, .prompt-creator__placeholder-select').forEach(input => {
    input.addEventListener('input', () => {
      updatePreview(template);
    });
    input.addEventListener('change', () => {
      updatePreview(template);
    });
  });
  
  // Attach insert button handler
  const insertBtn = document.getElementById('prompt-creator-insert-btn');
  if (insertBtn) {
    insertBtn.addEventListener('click', () => {
      handleInsert();
    });
  }
  
  // Attach save to library button handler
  const saveToLibraryBtn = document.getElementById('prompt-creator-save-to-library-btn');
  if (saveToLibraryBtn) {
    saveToLibraryBtn.addEventListener('click', async () => {
      await handleSaveToLibraryClick();
    });
  }
  
  // Initial preview
  updatePreview(template);
}

/**
 * Updates the preview with current user selections
 * @param {Object} template - The template object
 */
function updatePreview(template) {
  const previewTextarea = document.getElementById('prompt-creator-final-prompt');
  if (!previewTextarea) return;
  
  // Collect all user selections
  const selections = {};
  template.placeholders.forEach(placeholder => {
    const input = document.getElementById(`placeholder-${placeholder.id}`);
    if (input) {
      const value = input.value.trim();
      selections[placeholder.id] = value || `[${placeholder.label}]`;
    }
  });
  
  // Replace placeholders in template
  let finalPrompt = template.template;
  
  // Replace each placeholder in order
  template.placeholders.forEach(placeholder => {
    const value = selections[placeholder.id] || `[${placeholder.label}]`;
    // Replace [placeholder-id] pattern (case-sensitive)
    const regex = new RegExp(`\\[${placeholder.id}\\]`, 'g');
    finalPrompt = finalPrompt.replace(regex, value);
  });
  
  // Also handle any remaining [] patterns (anonymous placeholders)
  // This is a fallback for templates that use [] without IDs
  let placeholderIndex = 0;
  finalPrompt = finalPrompt.replace(/\[\]/g, () => {
    if (placeholderIndex < template.placeholders.length) {
      const placeholder = template.placeholders[placeholderIndex];
      const value = selections[placeholder.id] || `[${placeholder.label}]`;
      placeholderIndex++;
      return value;
    }
    return '[?]';
  });
  
  // Update preview
  previewTextarea.value = finalPrompt;
  
  // Store selections for insert
  creatorState.userSelections = selections;
}

/**
 * Handles inserting the final prompt into the chat interface
 */
async function handleInsert() {
  const previewTextarea = document.getElementById('prompt-creator-final-prompt');
  if (!previewTextarea) {
    console.error("[PromptProfile™] Preview textarea not found");
    return;
  }
  
  const promptText = previewTextarea.value.trim();
  if (!promptText) {
    console.error("[PromptProfile™] No prompt text to insert");
    return;
  }
  
  console.log("[PromptProfile™] Inserting prompt:", promptText.substring(0, 50) + "...");
  
  try {
    // Send message to background script to insert text
    const response = await chrome.runtime.sendMessage({
      type: "PROMPANION_INSERT_TEXT",
      text: promptText
    });
    
    if (response && response.ok) {
      console.log("[PromptProfile™] Prompt inserted successfully");
      // Optionally show success feedback
    } else {
      console.error("[PromptProfile™] Insert failed:", response?.reason || "Unknown error");
    }
  } catch (error) {
    console.error("[PromptProfile™] Error inserting prompt:", error);
  }
}

/**
 * Handles the save to library button click for Prompt Creator
 */
async function handleSaveToLibraryClick() {
  const previewTextarea = document.getElementById('prompt-creator-final-prompt');
  if (!previewTextarea) {
    console.error("[PromptProfile™] Prompt Creator final prompt textarea not found");
    return;
  }
  
  const promptText = previewTextarea.value.trim();
  if (!promptText) {
    alert("No prompt to save. Please create a prompt first.");
    return;
  }
  
  if (!promptCreatorStateRef || !promptCreatorDependencies) {
    console.error("[PromptProfile™] Prompt Creator state or dependencies not set");
    alert("Unable to save to library. Please try again.");
    return;
  }
  
  const saveToLibraryBtn = document.getElementById('prompt-creator-save-to-library-btn');
  if (!saveToLibraryBtn) {
    return;
  }
  
  if (saveToLibraryBtn.disabled) {
    return;
  }
  
  const originalButtonText = saveToLibraryBtn.textContent;
  saveToLibraryBtn.disabled = true;
  saveToLibraryBtn.textContent = "Saving...";
  
  try {
    // Import handleSaveToLibrary dynamically since promptCreator.js is not an ES module
    // We'll use the same function from promptEnhancer via window or import
    if (typeof window.handleSaveToLibrary === 'function') {
      await window.handleSaveToLibrary(promptCreatorStateRef, promptCreatorDependencies, promptText);
    } else {
      // Fallback: try to get it from the module
      const { handleSaveToLibrary } = await import('./promptEnhancer.js');
      await handleSaveToLibrary(promptCreatorStateRef, promptCreatorDependencies, promptText);
    }
    
    saveToLibraryBtn.textContent = "Saved!";
    setTimeout(() => {
      saveToLibraryBtn.textContent = originalButtonText;
    }, 1500);
  } catch (error) {
    console.error("[PromptProfile™] Save to library failed:", error);
    alert("Failed to save prompt to library. Please try again.");
    saveToLibraryBtn.textContent = originalButtonText;
  } finally {
    saveToLibraryBtn.disabled = false;
  }
}

/**
 * Registers event handlers for the Prompt Creator section
 */
function registerEventHandlers() {
  // Info button handler is registered in sidepanel.js
  // Additional handlers can be added here if needed
}

